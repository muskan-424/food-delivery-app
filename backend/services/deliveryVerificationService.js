import orderModel from "../models/orderModel.js";
import { appConfig } from "../config/appConfig.js";
import {
  markEscrowReleaseEligible,
  processEscrowReleaseAfterVerification,
} from "./escrowService.js";

/**
 * Rule-based MVP scorer (Air-Tasker mock pattern).
 */
export function scoreDeliveryVerification(order) {
  const pod = order?.proofOfDelivery || {};
  const method = String(pod.method || "none").toLowerCase();
  const reasons = [];

  if (order?.status !== "delivered") {
    return { outcome: "FAIL", confidence: 0, reasons: ["order_not_delivered"] };
  }

  if (!pod.verifiedAt) {
    return { outcome: "FAIL", confidence: 0.1, reasons: ["no_proof_of_delivery"] };
  }

  if (method === "photo") {
    const hasAfter = Boolean(pod.afterImageUrl || pod.evidenceUrl);
    const hasBefore = Boolean(pod.beforeImageUrl);
    if (hasAfter && hasBefore) {
      return { outcome: "PASS", confidence: 0.92, reasons: ["before_after_photos_present"] };
    }
    if (hasAfter) {
      return { outcome: "PASS", confidence: 0.85, reasons: ["photo_evidence_present"] };
    }
    return { outcome: "LOW_CONFIDENCE", confidence: 0.45, reasons: ["photo_method_missing_evidence"] };
  }

  if (method === "signature") {
    if (pod.signatureName || pod.evidenceUrl) {
      return { outcome: "PASS", confidence: 0.8, reasons: ["signature_evidence_present"] };
    }
    return { outcome: "LOW_CONFIDENCE", confidence: 0.4, reasons: ["signature_incomplete"] };
  }

  if (method === "otp") {
    reasons.push("otp_pod_verified");
    return { outcome: "PASS", confidence: 0.75, reasons };
  }

  return { outcome: "LOW_CONFIDENCE", confidence: 0.35, reasons: ["weak_or_unknown_pod_method"] };
}

export async function runDeliveryVerificationForOrder(orderId, { actorId = "system", actorKind = "system" } = {}) {
  const order = await orderModel.findById(orderId);
  if (!order) return { ok: false, code: "NOT_FOUND" };

  const score = scoreDeliveryVerification(order);
  order.deliveryVerificationResult = {
    outcome: score.outcome,
    confidence: score.confidence,
    checkedAt: new Date(),
    reasons: score.reasons,
    checkedBy: String(actorId || actorKind),
  };
  await order.save();

  let escrowResult = null;
  if (appConfig.enableEscrowPayments && score.outcome === "PASS") {
    const eligible = await markEscrowReleaseEligible({
      orderId: order._id,
      verification: score,
      actor: { kind: actorKind, id: String(actorId) },
    });
    if (eligible?.ok) {
      escrowResult = await processEscrowReleaseAfterVerification(order._id, {
        actor: { kind: actorKind, id: String(actorId) },
      });
    }
  }

  return {
    ok: true,
    order,
    verification: score,
    escrow: escrowResult,
  };
}
