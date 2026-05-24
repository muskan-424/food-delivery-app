import IORedis from "ioredis";

/** BullMQ requires separate Redis connections for Queue vs Worker. */
let queueRedis = null;
let workerRedis = null;

function createClient() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
  });
  client.on("error", (err) => {
    console.error("BullMQ Redis error:", err.message);
  });
  return client;
}

export function getQueueRedis() {
  if (!queueRedis) queueRedis = createClient();
  return queueRedis;
}

export function getWorkerRedis() {
  if (!workerRedis) workerRedis = createClient();
  return workerRedis;
}

export async function closeBullmqConnections() {
  if (queueRedis) {
    await queueRedis.quit().catch(() => {});
    queueRedis = null;
  }
  if (workerRedis) {
    await workerRedis.quit().catch(() => {});
    workerRedis = null;
  }
}
