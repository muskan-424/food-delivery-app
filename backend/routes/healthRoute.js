import express from "express";
import mongoose from "mongoose";
import { isRedisEnabled, pingRedis } from "../config/redis.js";
import { appConfig } from "../config/appConfig.js";
import { getGeneralQueue, getQueueRuntimeStats } from "../jobs/queue.js";
import { getSseClientCount, getSseStats } from "../realtime/sseHub.js";
import { getWsStats } from "../realtime/wsHub.js";
import { getScheduledOrderAdvancementState } from "../services/scheduledOrderService.js";
import { getLastDataRetentionRun, getRetentionPolicies } from "../utils/dataRetention.js";
import { getRequestMetricsSnapshot } from "../middleware/activityLogger.js";
import { getAnalyticsRuntimeStats } from "../services/analyticsEventService.js";
import { getObjectStorageStats } from "../utils/mediaStorage.js";

const router = express.Router();

router.get("/scheduling-config", (req, res) => {
  const queueActive = !!getGeneralQueue();
  const advancementRuntime = getScheduledOrderAdvancementState();
  res.status(200).json({
    success: true,
    scheduling: {
      enableScheduledJobs: appConfig.enableScheduledJobs,
      enableJobQueue: appConfig.enableJobQueue,
      queueActive,
      orderAdvancement: {
        everyMs: appConfig.scheduledOrderAdvancementEveryMs,
        limit: appConfig.scheduledOrderAdvancementLimit,
        overdueGraceMinutes: appConfig.scheduledOrderOverdueGraceMinutes,
        dryRunIdListCap: appConfig.scheduledOrderDryRunIdListCap,
        failureListCap: appConfig.scheduledOrderAdvancementFailureListCap,
      },
      runtime: advancementRuntime,
    },
  });
});

router.get("/", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;

  let redis = "disabled";
  if (isRedisEnabled()) {
    const result = await pingRedis();
    redis = result.ok ? "ok" : `error:${result.detail}`;
  }

  const redisOk = !isRedisEnabled() || redis === "ok";

  let jobQueue = "disabled";
  if (appConfig.enableJobQueue) {
    jobQueue = getGeneralQueue() ? "active" : "unavailable";
  }

  if (!mongoOk || !redisOk) {
    return res.status(503).json({
      success: false,
      mongo: mongoOk ? "connected" : "disconnected",
      redis,
      jobQueue,
      sseConnections: getSseClientCount(),
      sse: getSseStats(),
      websocket: getWsStats(),
      apiVersion: appConfig.apiVersion,
    });
  }

  res.status(200).json({
    success: true,
    mongo: "connected",
    redis,
    jobQueue,
    sseConnections: getSseClientCount(),
    sse: getSseStats(),
    websocket: getWsStats(),
    apiVersion: appConfig.apiVersion,
  });
});

router.get("/ops", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redis = "disabled";
  if (isRedisEnabled()) {
    const result = await pingRedis();
    redis = result.ok ? "ok" : `error:${result.detail}`;
  }
  const queueRuntime = await getQueueRuntimeStats();
  const m = process.memoryUsage();
  const load = process.cpuUsage();
  return res.status(200).json({
    success: true,
    health: {
      mongo: mongoOk ? "connected" : "disconnected",
      redis,
      jobQueue: getGeneralQueue() ? "active" : appConfig.enableJobQueue ? "unavailable" : "disabled",
      apiVersion: appConfig.apiVersion,
    },
    runtime: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round((m.rss / (1024 * 1024)) * 100) / 100,
        heapUsed: Math.round((m.heapUsed / (1024 * 1024)) * 100) / 100,
        heapTotal: Math.round((m.heapTotal / (1024 * 1024)) * 100) / 100,
      },
      cpuUsageMicros: {
        user: load.user,
        system: load.system,
      },
      now: new Date().toISOString(),
    },
    queue: queueRuntime,
    realtime: {
      sseConnections: getSseClientCount(),
      sse: getSseStats(),
      websocket: getWsStats(),
      scheduling: getScheduledOrderAdvancementState(),
    },
    retention: {
      policies: getRetentionPolicies(),
      lastRun: getLastDataRetentionRun(),
    },
    analytics: getAnalyticsRuntimeStats(),
    objectStorage: getObjectStorageStats(),
  });
});

router.get("/metrics-lite", (req, res) => {
  return res.status(200).json({
    success: true,
    data: getRequestMetricsSnapshot(),
  });
});

router.get("/metrics", (req, res) => {
  const snapshot = getRequestMetricsSnapshot();
  const lines = [];
  lines.push("# HELP http_requests_total Total HTTP requests observed.");
  lines.push("# TYPE http_requests_total counter");
  lines.push(`http_requests_total ${snapshot?.totals?.requests || 0}`);

  lines.push("# HELP http_request_errors_total Total HTTP errors by class.");
  lines.push("# TYPE http_request_errors_total counter");
  lines.push(
    `http_request_errors_total{class="4xx"} ${snapshot?.totals?.errors4xx || 0}`
  );
  lines.push(
    `http_request_errors_total{class="5xx"} ${snapshot?.totals?.errors5xx || 0}`
  );

  lines.push("# HELP http_request_slow_total Total slow HTTP requests.");
  lines.push("# TYPE http_request_slow_total counter");
  lines.push(`http_request_slow_total ${snapshot?.totals?.slow || 0}`);

  lines.push("# HELP http_route_requests_total Requests per normalized route.");
  lines.push("# TYPE http_route_requests_total counter");
  lines.push("# HELP http_route_latency_avg_ms Average latency by route in ms.");
  lines.push("# TYPE http_route_latency_avg_ms gauge");
  lines.push("# HELP http_route_latency_max_ms Max latency by route in ms.");
  lines.push("# TYPE http_route_latency_max_ms gauge");
  lines.push("# HELP http_route_errors_total Errors by route and class.");
  lines.push("# TYPE http_route_errors_total counter");
  lines.push("# HELP http_route_slow_total Slow requests by route.");
  lines.push("# TYPE http_route_slow_total counter");

  for (const row of snapshot?.routes || []) {
    const method = String(row.method || "GET").replace(/"/g, "");
    const path = String(row.path || "").replace(/"/g, "");
    lines.push(
      `http_route_requests_total{method="${method}",path="${path}"} ${Number(row.count || 0)}`
    );
    lines.push(
      `http_route_latency_avg_ms{method="${method}",path="${path}"} ${Number(
        row.avgMs || 0
      )}`
    );
    lines.push(
      `http_route_latency_max_ms{method="${method}",path="${path}"} ${Number(
        row.maxMs || 0
      )}`
    );
    lines.push(
      `http_route_errors_total{method="${method}",path="${path}",class="4xx"} ${Number(
        row.errors4xx || 0
      )}`
    );
    lines.push(
      `http_route_errors_total{method="${method}",path="${path}",class="5xx"} ${Number(
        row.errors5xx || 0
      )}`
    );
    lines.push(
      `http_route_slow_total{method="${method}",path="${path}"} ${Number(row.slow || 0)}`
    );
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return res.status(200).send(`${lines.join("\n")}\n`);
});

export default router;
