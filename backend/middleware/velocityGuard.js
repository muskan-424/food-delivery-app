import { appConfig } from "../config/appConfig.js";
import { getRedisClient, isRedisEnabled } from "../config/redis.js";

const memStore = new Map();

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
}

async function hitCounter(key, windowSec) {
  if (isRedisEnabled()) {
    const redis = getRedisClient();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }
    const ttl = await redis.ttl(key);
    return { count, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }

  const t = nowSeconds();
  const cur = memStore.get(key);
  if (!cur || cur.expiresAt <= t) {
    memStore.set(key, { count: 1, expiresAt: t + windowSec });
    return { count: 1, retryAfterSec: windowSec };
  }
  cur.count += 1;
  memStore.set(key, cur);
  return { count: cur.count, retryAfterSec: Math.max(1, cur.expiresAt - t) };
}

function buildVelocityMiddleware({ name, windowSec, maxHits, buildSubject }) {
  return async (req, res, next) => {
    if (!appConfig.enableFraudVelocityLimits) {
      return next();
    }
    try {
      const subject = buildSubject(req);
      if (!subject) return next();
      const key = `velocity:${name}:${subject}`;
      const { count, retryAfterSec } = await hitCounter(key, windowSec);
      if (count > maxHits) {
        return res.status(429).json({
          success: false,
          code: "VELOCITY_LIMIT_EXCEEDED",
          message: "Too many requests for this action. Please try again later.",
          retryAfterSec,
        });
      }
      return next();
    } catch (err) {
      console.error(`velocity guard (${name}):`, err.message);
      return next();
    }
  };
}

export const registerVelocityGuard = buildVelocityMiddleware({
  name: "register_ip_hour",
  windowSec: 60 * 60,
  maxHits: Math.max(1, Number(process.env.FRAUD_MAX_REGISTRATIONS_PER_IP_PER_HOUR) || 10),
  buildSubject: (req) => getClientIp(req),
});

export const orderPlacementVelocityGuard = buildVelocityMiddleware({
  name: "order_user_10m",
  windowSec: 10 * 60,
  maxHits: Math.max(1, Number(process.env.FRAUD_MAX_ORDERS_PER_USER_10M) || 5),
  buildSubject: (req) => req.body?.userId || null,
});

export const disputeCreateVelocityGuard = buildVelocityMiddleware({
  name: "dispute_user_day",
  windowSec: 24 * 60 * 60,
  maxHits: Math.max(1, Number(process.env.FRAUD_MAX_DISPUTES_PER_USER_PER_DAY) || 5),
  buildSubject: (req) => req.body?.userId || null,
});
