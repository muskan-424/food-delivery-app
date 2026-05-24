import { appConfig } from "../config/appConfig.js";
import analyticsEventModel from "../models/analyticsEventModel.js";

const runtime = {
  startedAt: new Date().toISOString(),
  attempted: 0,
  persisted: 0,
  skipped: 0,
  failed: 0,
  lastError: "",
  lastEventAt: null,
};

function shouldPersist({ statusCode, durationMs }) {
  if (statusCode >= 500) return true;
  if (durationMs >= appConfig.requestLogSlowMs) return true;
  return Math.random() < appConfig.analyticsEventSampleRate;
}

export async function recordHttpAnalyticsEvent(payload) {
  runtime.attempted += 1;
  if (!appConfig.enableAnalyticsEvents) {
    runtime.skipped += 1;
    return { ok: false, reason: "disabled" };
  }
  if (!shouldPersist(payload || {})) {
    runtime.skipped += 1;
    return { ok: false, reason: "sampled_out" };
  }
  try {
    await analyticsEventModel.create({
      eventType: "http_request",
      requestId: String(payload?.requestId || ""),
      userId: String(payload?.userId || ""),
      role: String(payload?.role || ""),
      method: String(payload?.method || ""),
      path: String(payload?.path || ""),
      statusCode: Number(payload?.statusCode || 0),
      durationMs: Number(payload?.durationMs || 0),
      meta: {
        sampled: !!payload?.sampled,
      },
    });
    runtime.persisted += 1;
    runtime.lastEventAt = new Date().toISOString();
    return { ok: true };
  } catch (error) {
    runtime.failed += 1;
    runtime.lastError = error?.message || "analytics_event_write_failed";
    return { ok: false, reason: "write_failed" };
  }
}

export function getAnalyticsRuntimeStats() {
  return {
    ...runtime,
    enabled: appConfig.enableAnalyticsEvents,
    sampleRate: appConfig.analyticsEventSampleRate,
    generatedAt: new Date().toISOString(),
  };
}

