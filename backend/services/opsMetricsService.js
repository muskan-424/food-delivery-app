import orderEscrowModel, { ESCROW_STATUSES } from "../models/orderEscrowModel.js";
import escrowEventModel from "../models/escrowEventModel.js";
import paymentWebhookEventModel from "../models/paymentWebhookEventModel.js";
import paymentModel from "../models/paymentModel.js";
import notificationModel from "../models/notificationModel.js";
import { appConfig } from "../config/appConfig.js";
import {
  countWebhookVsPaymentDrift,
  countOrderPaymentMismatches,
  countStaleOnlinePending,
  countSuccessRazorpayMissingRefs,
} from "./paymentReconciliationService.js";

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export async function getEscrowMetricsSummary() {
  const statusAgg = await orderEscrowModel.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmountInr: { $sum: "$amount" },
      },
    },
  ]);

  const byStatus = {};
  for (const s of ESCROW_STATUSES) byStatus[s] = { count: 0, totalAmountInr: 0 };
  let total = 0;
  let totalAmountInr = 0;
  for (const row of statusAgg) {
    const key = row._id || "unknown";
    if (!byStatus[key]) byStatus[key] = { count: 0, totalAmountInr: 0 };
    byStatus[key].count = row.count;
    byStatus[key].totalAmountInr = Math.round((row.totalAmountInr || 0) * 100) / 100;
    total += row.count;
    totalAmountInr += row.totalAmountInr || 0;
  }

  const staleCutoff = daysAgo(1);
  const [pendingRelease, disputeOpened, staleReleaseEligible, payoutFailed7d] =
    await Promise.all([
      orderEscrowModel.countDocuments({ status: "RELEASE_ELIGIBLE" }),
      orderEscrowModel.countDocuments({ status: "DISPUTE_OPENED" }),
      orderEscrowModel.countDocuments({
        status: "RELEASE_ELIGIBLE",
        updatedAt: { $lt: staleCutoff },
      }),
      escrowEventModel.countDocuments({
        type: "PAYOUT_FAILED",
        createdAt: { $gte: daysAgo(7) },
      }),
    ]);

  const awaitingPayout = await orderEscrowModel.countDocuments({
    status: "RELEASE_ELIGIBLE",
    $or: [{ razorpayPayoutId: { $in: [null, ""] } }, { razorpayPayoutId: { $exists: false } }],
  });

  return {
    enabled: appConfig.enableEscrowPayments,
    razorpayxEnabled: appConfig.enableRazorpayxPayouts,
    total,
    totalAmountInr: Math.round(totalAmountInr * 100) / 100,
    byStatus,
    pipeline: {
      pendingRelease,
      disputeOpened,
      awaitingPayout,
      staleReleaseEligible,
      payoutFailedLast7d: payoutFailed7d,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getPaymentOpsMetricsSummary() {
  const from = daysAgo(7);
  const to = new Date();
  const staleMs = appConfig.reconciliationStalePendingHours * 3600 * 1000;

  const [
    webhookTotals7d,
    lastWebhook,
    pendingPayments,
    successPayments7d,
    driftCount,
    mismatchCount,
    stalePendingCount,
    missingRefCount,
    notifications7d,
  ] = await Promise.all([
    paymentWebhookEventModel.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    paymentWebhookEventModel.findOne().sort({ createdAt: -1 }).select("createdAt provider").lean(),
    paymentModel.countDocuments({ status: "pending" }),
    paymentModel.countDocuments({
      status: "success",
      paidAt: { $gte: from, $lte: to },
    }),
    countWebhookVsPaymentDrift(from, to),
    countOrderPaymentMismatches(from, to),
    countStaleOnlinePending(from, to, staleMs),
    countSuccessRazorpayMissingRefs(from, to),
    notificationModel.countDocuments({ createdAt: { $gte: from, $lte: to } }),
  ]);

  const webhooks24h = await paymentWebhookEventModel.countDocuments({
    createdAt: { $gte: daysAgo(1), $lte: to },
  });

  const lagMinutes =
    lastWebhook?.createdAt != null
      ? Math.floor((Date.now() - new Date(lastWebhook.createdAt).getTime()) / 60000)
      : null;

  return {
    windowDays: 7,
    payments: {
      pendingCount: pendingPayments,
      successLast7d: successPayments7d,
    },
    webhooks: {
      eventsLast24h: webhooks24h,
      eventsLast7d: webhookTotals7d,
      lastEventAt: lastWebhook?.createdAt || null,
      lastEventProvider: lastWebhook?.provider || null,
      lagMinutes,
    },
    reconciliation: {
      stalePendingHours: appConfig.reconciliationStalePendingHours,
      webhookVsPaymentDrift: driftCount,
      orderPaymentMismatch: mismatchCount,
      staleOnlinePending: stalePendingCount,
      successRazorpayMissingRefs: missingRefCount,
    },
    notifications: {
      createdLast7d: notifications7d,
    },
    generatedAt: new Date().toISOString(),
  };
}
