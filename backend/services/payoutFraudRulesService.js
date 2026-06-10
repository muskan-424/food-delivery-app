import mongoose from "mongoose";
import orderEscrowModel from "../models/orderEscrowModel.js";
import disputeModel from "../models/disputeModel.js";
import userModel from "../models/userModel.js";
import { appConfig } from "../config/appConfig.js";
import { writeAudit } from "./auditService.js";
import { recordEscrowEvent } from "./escrowService.js";

export function getDefaultPayoutFraudRules() {
  return {
    enabled: appConfig.enablePayoutFraudRules,
    blockOnOpenDispute: appConfig.payoutFraudBlockOnOpenDispute,
    blockOnChargebackFlag: appConfig.payoutFraudBlockOnChargebackFlag,
    blockOnCustomerBlocked: appConfig.payoutFraudBlockOnCustomerBlocked,
    blockOnHighWarnings: appConfig.payoutFraudBlockOnHighWarnings,
    highWarningsThreshold: appConfig.payoutFraudHighWarningsThreshold,
    blockOnChargebackSegment: appConfig.payoutFraudBlockOnChargebackSegment,
    blockOnPayoutVelocity: appConfig.payoutFraudBlockOnPayoutVelocity,
    maxPayoutsPerUserPerHour: appConfig.payoutFraudMaxPayoutsPerUserPerHour,
  };
}

/**
 * Pure rule evaluation for unit tests and runtime checks.
 */
export function evaluatePayoutFraudRules(signals, rules = getDefaultPayoutFraudRules()) {
  if (!rules.enabled) {
    return { blocked: false, reasons: [] };
  }

  const reasons = [];
  if (rules.blockOnOpenDispute && signals.hasOpenDispute) reasons.push("open_dispute");
  if (rules.blockOnChargebackFlag && signals.chargebackFlag) reasons.push("chargeback_flag");
  if (rules.blockOnCustomerBlocked && signals.customerBlocked) reasons.push("customer_blocked");
  if (rules.blockOnHighWarnings && signals.customerWarnings >= rules.highWarningsThreshold) {
    reasons.push("high_warnings");
  }
  if (rules.blockOnChargebackSegment && signals.hasChargebackSegment) {
    reasons.push("chargeback_segment");
  }
  if (
    rules.blockOnPayoutVelocity &&
    signals.recentPayoutCount >= rules.maxPayoutsPerUserPerHour
  ) {
    reasons.push("payout_velocity");
  }

  return { blocked: reasons.length > 0, reasons };
}

export function buildEscrowPayoutIdempotencyKey(escrowId) {
  return `payout-${String(escrowId)}`;
}

export async function collectPayoutFraudSignals(order, escrow) {
  const customerUserId = String(order?.userId || escrow?.userId || "");
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [openDispute, customer, recentPayoutCount] = await Promise.all([
    disputeModel
      .findOne({
        orderId: order?._id || escrow?.orderId,
        status: { $in: ["open", "in_review", "awaiting_customer"] },
      })
      .select("_id")
      .lean(),
    customerUserId && mongoose.isValidObjectId(customerUserId)
      ? userModel
          .findById(customerUserId)
          .select("isBlocked warnings segmentTags chargebackFlag")
          .lean()
      : null,
    customerUserId
      ? orderEscrowModel.countDocuments({
          userId: customerUserId,
          status: "RELEASED",
          releasedAt: { $gte: hourAgo },
        })
      : 0,
  ]);

  const tags = Array.isArray(customer?.segmentTags)
    ? customer.segmentTags.map((t) => String(t).toLowerCase())
    : [];

  return {
    hasOpenDispute: Boolean(openDispute),
    chargebackFlag: Boolean(customer?.chargebackFlag),
    customerBlocked: Boolean(customer?.isBlocked),
    customerWarnings: Number(customer?.warnings || 0),
    hasChargebackSegment: tags.includes("chargeback") || tags.includes("payout_blocked"),
    recentPayoutCount,
  };
}

export async function checkPayoutFraudBlock(order, escrow) {
  if (escrow?.payoutFraudOverride?.allowed) {
    return { blocked: false, overridden: true, reasons: [] };
  }

  const signals = await collectPayoutFraudSignals(order, escrow);
  const evaluation = evaluatePayoutFraudRules(signals);
  return { ...evaluation, signals };
}

export async function recordPayoutFraudBlock({ order, escrow, reasons, actor = {} }) {
  escrow.lastPayoutFraudBlock = {
    reasons: reasons || [],
    at: new Date(),
  };
  await escrow.save();

  await recordEscrowEvent({
    orderId: escrow.orderId,
    escrowId: escrow._id,
    type: "PAYOUT_FAILED",
    payload: { reason: "fraud_rules", rules: reasons },
    actor,
  });

  await writeAudit(null, {
    action: "escrow.payout_fraud_blocked",
    resourceType: "order",
    resourceId: String(escrow.orderId),
    meta: { escrowId: String(escrow._id), reasons },
  });
}

export async function setEscrowPayoutFraudOverride(orderId, { adminUserId, reasonCode, note }) {
  const escrow = await orderEscrowModel.findOne({ orderId });
  if (!escrow) return { ok: false, code: "NO_ESCROW" };

  escrow.payoutFraudOverride = {
    allowed: true,
    reasonCode: String(reasonCode || "admin_override").slice(0, 64),
    note: String(note || "").slice(0, 500),
    adminUserId: String(adminUserId || ""),
    at: new Date(),
  };
  escrow.lastPayoutFraudBlock = undefined;
  await escrow.save();

  await writeAudit(null, {
    userId: adminUserId,
    action: "escrow.payout_fraud_override",
    resourceType: "order",
    resourceId: String(orderId),
    meta: {
      reasonCode: escrow.payoutFraudOverride.reasonCode,
      note: escrow.payoutFraudOverride.note,
    },
  });

  return { ok: true, escrow };
}
