import Redis from "ioredis";

const url = process.env.REDIS_URL?.trim();

let client = null;

export function isRedisEnabled() {
  return Boolean(url);
}

/**
 * Shared Redis client (rate limits, health). Only created when REDIS_URL is set.
 */
export function getRedisClient() {
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: null,
    });
    client.on("error", (err) => {
      console.error("Redis error:", err.message);
    });
  }
  return client;
}

export async function pingRedis() {
  if (!url) {
    return { ok: false, detail: "not_configured" };
  }
  try {
    const pong = await getRedisClient().ping();
    return { ok: pong === "PONG", detail: pong === "PONG" ? "ok" : "unexpected" };
  } catch (err) {
    return { ok: false, detail: err.message || "error" };
  }
}
