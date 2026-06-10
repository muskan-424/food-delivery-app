import disputeEventModel from "../models/disputeEventModel.js";
import orderEscrowModel from "../models/orderEscrowModel.js";
import paymentModel from "../models/paymentModel.js";
import orderModel from "../models/orderModel.js";
import { appConfig } from "../config/appConfig.js";
import {
  recordEscrowEvent,
  markEscrowReleaseEligible,
  processEscrowReleaseAfterVerification,
  cancelEscrowForOrder,
  recordEscrowRefundInitiated,
} from "./escrowService.js";
import { createRazorpayRefund, isRazorpayConfigured } from "./razorpayService.js";

async function recordDisputeEvent({ disputeId, orderId, type, payload, actor }) {
  try {
    return await disputeEventModel.create({
      disputeId,
      orderId: orderId || null,
      type,
      payload: payload || null,
      actor: {
        kind: actor?.kind || "system",
        id: String(actor?.id || ""),
      },
    });
  } catch (err) {
    console.error("recordDisputeEvent:", err.message);
    return null;
  }
}

export async function onDisputeOpened({ disputeId, orderId, actor }) {
  await recordDisputeEvent({
    disputeId,
    orderId,
    type: "OPENED",
    payload: {},
    actor,
  });

  if (!appConfig.enableEscrowPayments) return null;

  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return null;
  if (["RELEASED", "CANCELLED"].includes(escrow.status)) return escrow;

  escrow.status = "DISPUTE_OPENED";
  await escrow.save();

  await recordEscrowEvent({
    orderId,
    escrowId: escrow._id,
    type: "DISPUTE_OPENED",
    payload: { disputeId: String(disputeId) },
    actor,
  });
  await recordDisputeEvent({
    disputeId,
    orderId,
    type: "ESCROW_DISPUTE_OPENED",
    payload: { escrowId: String(escrow._id) },
    actor,
  });

  return escrow;
}

export async function tryRefundEscrowCapture(escrow, { disputeId, refundAmountInr, actor }) {
  if (!escrow) return { ok: false, reason: "no_escrow" };
  if (escrow.razorpayRefundId) return { ok: false, reason: "already_refunded" };

  const paymentRef =
    String(escrow.razorpayPaymentId || "").trim() ||
    (await paymentModel.findOne({ orderId: escrow.orderId, status: "success" })
      .then((p) => p?.transactionId || p?.providerPaymentId || ""));

  if (!paymentRef) return { ok: false, reason: "no_payment_ref" };
  if (!isRazorpayConfigured()) return { ok: false, reason: "razorpay_not_configured" };

  const amountPaise =
    refundAmountInr != null && Number(refundAmountInr) > 0
      ? Math.round(Number(refundAmountInr) * 100)
      : undefined;

  const rp = await createRazorpayRefund(paymentRef, {
    amountPaise,
    notes: { disputeId: String(disputeId || ""), escrowId: String(escrow._id) },
  });

  escrow.razorpayRefundId = rp?.id || "";
  escrow.status = "CANCELLED";
  escrow.cancelledAt = new Date();
  await escrow.save();

  await recordEscrowRefundInitiated(escrow.orderId, {
    refundAmount: refundAmountInr ?? escrow.amount,
    refundId: escrow.razorpayRefundId,
    actor,
  });

  return { ok: true, refundId: escrow.razorpayRefundId };
}

export async function onDisputeFinancialResolve({
  disputeId,
  orderId,
  financialOutcome,
  refundAmountInr,
  actor,
}) {
  const outcome = String(financialOutcome || "none").toLowerCase();
  if (!["release", "refund", "none"].includes(outcome)) {
    return { ok: false, reason: "invalid_outcome" };
  }

  await recordDisputeEvent({
    disputeId,
    orderId,
    type:
      outcome === "release"
        ? "RESOLVED_RELEASE"
        : outcome === "refund"
          ? "RESOLVED_REFUND"
          : "RESOLVED_NONE",
    payload: { financialOutcome: outcome, refundAmountInr: refundAmountInr ?? null },
    actor,
  });

  if (!appConfig.enableEscrowPayments || outcome === "none") {
    return { ok: true, skipped: true };
  }

  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return { ok: true, skipped: true, reason: "no_escrow" };

  if (outcome === "release") {
    const order = await orderModel.findById(orderId);
    if (order && !order.deliveryVerificationResult?.outcome) {
      order.deliveryVerificationResult = {
        outcome: "PASS",
        confidence: 0.7,
        checkedAt: new Date(),
        reasons: ["dispute_resolved_release"],
        checkedBy: String(actor?.id || "dispute_resolve"),
      };
      await order.save();
    }
    await markEscrowReleaseEligible({
      orderId,
      verification: { source: "dispute_resolve", outcome: "PASS" },
      actor,
    });
    const payout = await processEscrowReleaseAfterVerification(orderId, { actor });
    return { ok: true, outcome: "release", payout };
  }

  if (outcome === "refund") {
    try {
      const refund = await tryRefundEscrowCapture(escrow, {
        disputeId,
        refundAmountInr,
        actor,
      });
      if (!refund.ok && refund.reason !== "already_refunded") {
        await cancelEscrowForOrder(orderId, { reason: "dispute_refund", actor });
        const pay = await paymentModel.findOne({ orderId, status: "success" });
        if (pay && isRazorpayConfigured()) {
          const ref = pay.transactionId || pay.providerPaymentId;
          if (ref) {
            const rp = await createRazorpayRefund(ref, {
              amountPaise:
                refundAmountInr != null ? Math.round(Number(refundAmountInr) * 100) : undefined,
            });
            pay.status = "refunded";
            pay.refundDetails = {
              refundAmount: refundAmountInr ?? pay.amount,
              refundReason: "dispute_resolution",
              refundedAt: new Date(),
              refundTransactionId: rp?.id || "",
            };
            await pay.save();
          }
        }
      }
      return { ok: true, outcome: "refund", refund };
    } catch (err) {
      console.error("onDisputeFinancialResolve refund:", err);
      return { ok: false, reason: err.message };
    }
  }

  return { ok: true };
}

export async function listDisputeEvents(disputeId) {
  return disputeEventModel.find({ disputeId }).sort({ createdAt: 1 }).lean();
}
