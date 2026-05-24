/**
 * In-memory SSE fan-out per user (Phase 6). Scale-out needs Redis pub/sub adapter.
 */
import { appConfig } from "../config/appConfig.js";

const clients = new Map();

export function registerSseClient(userId, res) {
  const key = String(userId);
  const currentTotal = getSseClientCount();
  if (currentTotal >= appConfig.sseMaxClientsGlobal) {
    return { ok: false, reason: "global_limit_reached", unregister: () => {} };
  }
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }
  const set = clients.get(key);
  if (set.size >= appConfig.sseMaxClientsPerUser) {
    return { ok: false, reason: "per_user_limit_reached", unregister: () => {} };
  }
  set.add(res);

  const unregister = function unregister() {
    const set = clients.get(key);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) {
      clients.delete(key);
    }
  };
  return { ok: true, unregister };
}

export function broadcastToUser(userId, payload) {
  const key = String(userId);
  const set = clients.get(key);
  if (!set?.size) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(line);
    } catch {
      set.delete(res);
    }
  }
  if (set.size === 0) {
    clients.delete(key);
  }
}

export function getSseClientCount() {
  let n = 0;
  for (const set of clients.values()) {
    n += set.size;
  }
  return n;
}

export function getSseStats() {
  return {
    totalConnections: getSseClientCount(),
    userBuckets: clients.size,
    maxGlobal: appConfig.sseMaxClientsGlobal,
    maxPerUser: appConfig.sseMaxClientsPerUser,
  };
}
