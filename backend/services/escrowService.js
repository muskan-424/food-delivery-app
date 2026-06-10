import orderEscrowModel, { ESCROW_STATUSES } from "../models/orderEscrowModel.js";
import escrowEventModel, { ESCROW_EVENT_TYPES } from "../models/escrowEventModel.js";
import { appConfig } from "../config/appConfig.js";

export async function recordEscrowEvent({ orderId, escrowId, type, payload = {}, actor = {} }) {
  try {
    if (!ESCROW_EVENT_TYPES.includes(type)) return null;
    return await escrowEventModel.create({
      orderId,
      escrowId,
      type,
      payload,
      actor: {
        kind: actor.kind || "system",
        id: actor.id != null ? String(actor.id) : "",
      },
    });
  } catch (err) {
    console.error("recordEscrowEvent failed:", err.message);
    return null;
  }
}

export async function getEscrowByOrderId(orderId) {
  return orderEscrowModel.findOne({ orderId });
}

export async function listEscrowEventsByOrderId(orderId) {
  return escrowEventModel.find({ orderId }).sort({ createdAt: 1 }).lean();
}

/**
 * Idempotent escrow row for an order when ENABLE_ESCROW_PAYMENTS=true.
 */
export async function ensureEscrowForOrder({ orderId, userId, amount, currency = "INR" }) {
  if (!appConfig.enableEscrowPayments) return null;

  const existing = await orderEscrowModel.findOne({ orderId });
  if (existing) return existing;

  const escrow = await orderEscrowModel.create({
    orderId,
    userId: String(userId),
    amount: Number(amount) || 0,
    currency: currency || "INR",
    status: "HELD",
  });

  await recordEscrowEvent({
    orderId,
    escrowId: escrow._id,
    type: "HELD",
    payload: { amount: escrow.amount, currency: escrow.currency },
    actor: { kind: "system", id: "escrow" },
  });

  return escrow;
}

export async function onEscrowPaymentCaptured({
  orderId,
  razorpayOrderId,
  razorpayPaymentId,
  actor = { kind: "system", id: "payment" },
}) {
  if (!appConfig.enableEscrowPayments) return null;

  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return null;

  if (razorpayOrderId) escrow.razorpayOrderId = razorpayOrderId;
  if (razorpayPaymentId) escrow.razorpayPaymentId = razorpayPaymentId;
  if (!escrow.capturedAt) escrow.capturedAt = new Date();
  if (escrow.status === "HELD") escrow.status = "HELD";
  await escrow.save();

  await recordEscrowEvent({
    orderId: escrow.orderId,
    escrowId: escrow._id,
    type: "PAYMENT_CAPTURED",
    payload: { razorpayOrderId, razorpayPaymentId },
    actor,
  });

  return escrow;
}

export async function markEscrowReleaseEligible({ orderId, verification, actor = {} }) {
  if (!appConfig.enableEscrowPayments) return { ok: false, code: "DISABLED" };

  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return { ok: false, code: "NO_ESCROW" };
  if (["RELEASED", "CANCELLED", "DISPUTE_OPENED"].includes(escrow.status)) {
    return { ok: false, code: "TERMINAL", status: escrow.status };
  }

  escrow.status = "RELEASE_ELIGIBLE";
  await escrow.save();

  await recordEscrowEvent({
    orderId,
    escrowId: escrow._id,
    type: "VERIFICATION_PASSED",
    payload: verification || {},
    actor,
  });
  await recordEscrowEvent({
    orderId,
    escrowId: escrow._id,
    type: "RELEASE_ELIGIBLE",
    payload: {},
    actor,
  });

  return { ok: true, escrow };
}

export async function processEscrowReleaseAfterVerification(orderId, { actor = {} } = {}) {
  if (!appConfig.enableEscrowPayments) return null;
  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow || escrow.status !== "RELEASE_ELIGIBLE") return null;

  const { tryEscrowPayoutOnRelease } = await import("./escrowPayoutService.js");
  const order = await import("../models/orderModel.js").then((m) => m.default.findById(orderId));
  if (!order) return null;
  return tryEscrowPayoutOnRelease(order, escrow, { actor });
}

export async function cancelEscrowForOrder(orderId, { reason = "", actor = {} } = {}) {
  if (!appConfig.enableEscrowPayments) return null;
  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return null;
  if (["RELEASED", "CANCELLED"].includes(escrow.status)) return escrow;

  escrow.status = "CANCELLED";
  escrow.cancelledAt = new Date();
  await escrow.save();

  await recordEscrowEvent({
    orderId,
    escrowId: escrow._id,
    type: "CANCELLED",
    payload: { reason },
    actor,
  });

  return escrow;
}

export async function recordEscrowRefundInitiated(orderId, { refundAmount, refundId, actor = {} } = {}) {
  if (!appConfig.enableEscrowPayments) return null;
  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return null;

  if (escrow.status !== "CANCELLED") {
    escrow.status = "CANCELLED";
    escrow.cancelledAt = new Date();
    await escrow.save();
    await recordEscrowEvent({
      orderId,
      escrowId: escrow._id,
      type: "CANCELLED",
      payload: { source: "refund" },
      actor,
    });
  }

  await recordEscrowEvent({
    orderId,
    escrowId: escrow._id,
    type: "REFUND_INITIATED",
    payload: { refundAmount, refundId },
    actor,
  });

  return escrow;
}

export async function aggregateEscrowByDay(from, to) {
  const createdAtMatch = {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
  const match = Object.keys(createdAtMatch).length ? { createdAt: createdAtMatch } : {};
  return orderEscrowModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          status: "$status",
        },
        count: { $sum: 1 },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.day": 1 } },
  ]);
}

export async function getEscrowMetricsSummary() {
  const grouped = await orderEscrowModel.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);
  const byStatus = {};
  for (const s of ESCROW_STATUSES) {
    byStatus[s] = { count: 0, amount: 0 };
  }
  for (const g of grouped) {
    if (g._id) {
      byStatus[g._id] = { count: g.count, amount: Math.round(g.amount * 100) / 100 };
    }
  }
  return {
    enabled: appConfig.enableEscrowPayments,
    byStatus,
    generatedAt: new Date().toISOString(),
  };
}
