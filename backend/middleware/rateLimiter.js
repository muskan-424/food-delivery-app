import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient, isRedisEnabled } from "../config/redis.js";

function redisStore(prefix) {
  if (!isRedisEnabled()) return undefined;
  const client = getRedisClient();
  if (!client) return undefined;
  return new RedisStore({
    sendCommand: (command, ...args) => client.call(command, ...args),
    prefix: `food-delivery:rl:${prefix}:`,
  });
}

function createLimiter(options, redisPrefix) {
  const store = redisStore(redisPrefix);
  return rateLimit({
    ...options,
    ...(store ? { store } : {}),
  });
}

// General API rate limiter
export const apiLimiter = createLimiter(
  {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
      success: false,
      message: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  },
  "api"
);

// Rate limiter for authentication endpoints
export const authLimiter = createLimiter(
  {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
      success: false,
      message: "Too many login attempts. Please wait 15 minutes and try again.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  },
  "auth"
);

// Rate limiter for order placement
export const orderLimiter = createLimiter(
  {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: {
      success: false,
      message: "Too many order requests, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  },
  "order"
);
