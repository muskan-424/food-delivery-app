import orderModel from "../models/orderModel.js";
import { appConfig } from "../config/appConfig.js";
import { transitionOrderById } from "./orderTransitionService.js";

const advancementRuntimeState = {
  isRunning: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastDurationMs: null,
  lastRunSource: null,
  lastResult: null,
};

export function getScheduledOrderAdvancementState() {
  return { ...advancementRuntimeState };
}

/**
 * Advance due scheduled orders in small batches.
 * Current behavior:
 * - pending -> confirmed once scheduled time is reached
 */
export async function runScheduledOrderAdvancementSweep({
  limit = 50,
  dryRun = false,
  restaurantId = null,
  source = "unknown",
} = {}) {
  if (advancementRuntimeState.isRunning) {
    return {
      skipped: true,
      reason: "SWEEP_ALREADY_RUNNING",
      dryRun,
      runningSince: advancementRuntimeState.lastStartedAt,
      source,
    };
  }

  advancementRuntimeState.isRunning = true;
  advancementRuntimeState.lastStartedAt = new Date().toISOString();
  advancementRuntimeState.lastRunSource = source;
  const sweepStartedAt = Date.now();

  let result = null;
  try {
    const now = new Date();
    const effectiveLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const dueQuery = {
      scheduledFor: { $ne: null, $lte: now },
      status: "pending",
      ...(restaurantId ? { restaurantId } : {}),
    };
    const due = await orderModel
      .find(dueQuery)
      .sort({ scheduledFor: 1 })
      .limit(effectiveLimit)
      .select("_id orderNumber status scheduledFor");

    let advanced = 0;
    let failed = 0;
    const allDueOrderIds = due.map((o) => String(o._id));
    const dueOrderCount = allDueOrderIds.length;
    if (dryRun) {
      const cap = appConfig.scheduledOrderDryRunIdListCap;
      const dueOrderIdsTruncated = allDueOrderIds.length > cap;
      const dueOrderIds = allDueOrderIds.slice(0, cap);
      result = {
        skipped: false,
        scanned: due.length,
        dueOrderCount,
        advanced: 0,
        failed: 0,
        dryRun: true,
        dueOrderIds,
        dueOrderIdsTruncated,
        restaurantId: restaurantId || null,
        effectiveLimit,
        source,
      };
      return result;
    }

    const failedOrderDetails = [];
    for (const order of due) {
      const transition = await transitionOrderById(order._id, "confirmed", {
        message: "Auto-confirmed at scheduled slot time",
        updatedBy: "system",
      });
      if (transition.ok) {
        advanced += 1;
      } else {
        failed += 1;
        if (failedOrderDetails.length < appConfig.scheduledOrderAdvancementFailureListCap) {
          failedOrderDetails.push({
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            from: transition.from || order.status,
            to: transition.to || "confirmed",
            code: transition.code || "UNKNOWN",
          });
        }
      }
    }

    result = {
      skipped: false,
      scanned: due.length,
      dueOrderCount,
      advanced,
      failed,
      dryRun: false,
      dueOrderIds: allDueOrderIds,
      dueOrderIdsTruncated: false,
      failedOrderDetails,
      failedOrderDetailsTruncated:
        failed > failedOrderDetails.length,
      restaurantId: restaurantId || null,
      effectiveLimit,
      source,
    };
    return result;
  } finally {
    advancementRuntimeState.isRunning = false;
    advancementRuntimeState.lastCompletedAt = new Date().toISOString();
    advancementRuntimeState.lastDurationMs = Date.now() - sweepStartedAt;
    advancementRuntimeState.lastResult = result;
  }
}

