import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import { appConfig } from "../config/appConfig.js";
import {
  createRazorpayContact,
  createRazorpayFundAccountBank,
  createRazorpayPayout,
  isRazorpayXConfigured,
} from "./razorpayXService.js";
import {
  recordEscrowEvent,
  getEscrowByOrderId,
} from "./escrowService.js";
import {
  isValidIfsc,
  normalizeIfsc,
  normalizeAccountNumber,
  accountLast4,
} from "../utils/bankValidation.js";
import { assertKycForPayout } from "../utils/userKycUtils.js";
import {
  buildEscrowPayoutIdempotencyKey,
  checkPayoutFraudBlock,
  recordPayoutFraudBlock,
} from "./payoutFraudRulesService.js";

export async function registerUserPayoutBank({
  userId,
  beneficiaryName,
  ifsc,
  accountNumber,
}) {
  const user = await userModel.findById(userId);
  if (!user) {
    const err = new Error("user_not_found");
    throw err;
  }

  const kycGate = await assertKycForPayout(userId);
  if (!kycGate.ok) {
    const err = new Error("kyc_required");
    err.message = kycGate.message;
    throw err;
  }

  const normalizedIfsc = normalizeIfsc(ifsc);
  const normalizedAccount = normalizeAccountNumber(accountNumber);
  if (!isValidIfsc(normalizedIfsc)) {
    const err = new Error("invalid_ifsc");
    throw err;
  }
  if (normalizedAccount.length < 8 || normalizedAccount.length > 18) {
    const err = new Error("invalid_account");
    throw err;
  }
  if (!beneficiaryName || String(beneficiaryName).trim().length < 2) {
    const err = new Error("invalid_beneficiary");
    throw err;
  }

  if (!isRazorpayXConfigured()) {
    const err = new Error("razorpayx_not_configured");
    throw err;
  }

  let contactId = user.razorpayContactId;
  if (!contactId) {
    const contact = await createRazorpayContact({
      name: user.name || beneficiaryName,
      email: user.email,
      phone: user.phone || "",
      referenceId: `user_${user._id}`.replace(/-/g, "").slice(0, 40),
    });
    contactId = contact?.id;
    user.razorpayContactId = contactId || "";
  }

  const fundAccount = await createRazorpayFundAccountBank({
    contactId,
    beneficiaryName: String(beneficiaryName).trim(),
    ifsc: normalizedIfsc,
    accountNumber: normalizedAccount,
  });

  user.razorpayFundAccountId = fundAccount?.id || "";
  user.razorpayPayoutBank = {
    beneficiaryName: String(beneficiaryName).trim().slice(0, 80),
    ifsc: normalizedIfsc,
    accountLast4: accountLast4(normalizedAccount),
    registeredAt: new Date(),
  };
  await user.save();

  return {
    contactId: user.razorpayContactId,
    fundAccountId: user.razorpayFundAccountId,
    bank: user.razorpayPayoutBank,
  };
}

export async function getUserPayoutStatus(userId) {
  const user = await userModel
    .findById(userId)
    .select("razorpayContactId razorpayFundAccountId razorpayPayoutBank email name");
  if (!user) return null;
  return {
    configured: isRazorpayXConfigured(),
    contactId: user.razorpayContactId || null,
    fundAccountId: user.razorpayFundAccountId || null,
    bank: user.razorpayPayoutBank || null,
    kycRequiredForPayout: appConfig.kycRequiredForPayout,
  };
}

export async function resolveRestaurantPayoutUser(restaurantId) {
  if (!restaurantId) return null;
  const withFinance = await userModel
    .findOne({
      "restaurantStaff.restaurantId": restaurantId,
      "restaurantStaff.active": true,
      razorpayFundAccountId: { $nin: ["", null] },
      "restaurantStaff.permissions": { $in: ["finance.read", "restaurant.manage"] },
    })
    .select("_id razorpayFundAccountId razorpayContactId name email");
  if (withFinance) return withFinance;

  return userModel
    .findOne({
      "restaurantStaff.restaurantId": restaurantId,
      "restaurantStaff.active": true,
      razorpayFundAccountId: { $nin: ["", null] },
    })
    .select("_id razorpayFundAccountId razorpayContactId name email");
}

function restaurantNetAmount(order) {
  const snap = order?.commissionSnapshot || {};
  const net = Number(snap.estimatedRestaurantNet);
  if (Number.isFinite(net) && net > 0) return net;
  const finalAmt = Number(order?.finalAmount || order?.amount || 0);
  const commission = Number(snap.amount || 0);
  return Math.max(0, finalAmt - commission);
}

/**
 * After escrow RELEASE_ELIGIBLE, attempt RazorpayX payout to restaurant staff user.
 */
export async function tryEscrowPayoutOnRelease(order, escrow, { actor = { kind: "system", id: "payout" } } = {}) {
  if (!appConfig.enableRazorpayxPayouts || !appConfig.enableEscrowPayments) {
    return { status: "skipped_feature_disabled" };
  }
  if (!isRazorpayXConfigured()) {
    return { status: "skipped_razorpayx_not_configured" };
  }
  if (!escrow) return { status: "skipped_no_escrow" };
  if (escrow.razorpayPayoutId) return { status: "skipped_already_paid_out" };
  if (!escrow.razorpayPaymentId && !escrow.capturedAt) {
    return { status: "skipped_no_capture" };
  }
  if (!["RELEASE_ELIGIBLE", "RELEASED"].includes(escrow.status)) {
    return { status: "skipped_invalid_escrow_status", escrowStatus: escrow.status };
  }

  const fraudCheck = await checkPayoutFraudBlock(order, escrow);
  if (fraudCheck.blocked) {
    await recordPayoutFraudBlock({
      order,
      escrow,
      reasons: fraudCheck.reasons,
      actor,
    });
    return {
      status: "blocked_fraud_rules",
      reasons: fraudCheck.reasons,
      signals: fraudCheck.signals,
    };
  }

  const payoutUser = await resolveRestaurantPayoutUser(order?.restaurantId);
  if (!payoutUser?.razorpayFundAccountId) {
    await recordEscrowEvent({
      orderId: escrow.orderId,
      escrowId: escrow._id,
      type: "PAYOUT_FAILED",
      payload: { reason: "no_restaurant_payout_user" },
      actor,
    });
    return { status: "skipped_no_payout_user" };
  }

  const amountInr = restaurantNetAmount(order);
  const amountPaise = Math.round(amountInr * 100);
  if (amountPaise <= 0) {
    return { status: "skipped_zero_amount" };
  }

  const idempotencyKey = buildEscrowPayoutIdempotencyKey(escrow._id);
  try {
    await recordEscrowEvent({
      orderId: escrow.orderId,
      escrowId: escrow._id,
      type: "PAYOUT_INITIATED",
      payload: { amountInr, fundAccountId: payoutUser.razorpayFundAccountId },
      actor,
    });

    const payout = await createRazorpayPayout({
      fundAccountId: payoutUser.razorpayFundAccountId,
      amountPaise,
      currency: escrow.currency || "INR",
      referenceId: `escrow_${String(escrow._id)}`.replace(/-/g, "").slice(0, 40),
      idempotencyKey,
      narration: "Restaurant order payout",
    });

    escrow.razorpayPayoutId = payout?.id || "";
    escrow.status = "RELEASED";
    escrow.releasedAt = new Date();
    await escrow.save();

    await recordEscrowEvent({
      orderId: escrow.orderId,
      escrowId: escrow._id,
      type: "PAYOUT_SUCCEEDED",
      payload: { payoutId: escrow.razorpayPayoutId, amountInr },
      actor,
    });
    await recordEscrowEvent({
      orderId: escrow.orderId,
      escrowId: escrow._id,
      type: "RELEASED",
      payload: { payoutId: escrow.razorpayPayoutId },
      actor,
    });

    return { status: "paid_out", payoutId: escrow.razorpayPayoutId, amountInr };
  } catch (error) {
    console.error("tryEscrowPayoutOnRelease:", error?.body || error.message);
    await recordEscrowEvent({
      orderId: escrow.orderId,
      escrowId: escrow._id,
      type: "PAYOUT_FAILED",
      payload: {
        reason: error.message,
        status: error.status,
        body: error.body ? JSON.stringify(error.body).slice(0, 400) : undefined,
      },
      actor,
    });
    return { status: "failed_razorpay", error: error.message };
  }
}

export async function initiateEscrowPayoutByOrderId(orderId, { actor } = {}) {
  const order = await orderModel.findById(orderId);
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
  const escrow = await getEscrowByOrderId(orderId);
  if (!escrow) return { ok: false, code: "NO_ESCROW" };
  if (escrow.status === "HELD" && order.deliveryVerificationResult?.outcome === "PASS") {
    escrow.status = "RELEASE_ELIGIBLE";
    await escrow.save();
    await recordEscrowEvent({
      orderId,
      escrowId: escrow._id,
      type: "RELEASE_ELIGIBLE",
      payload: { source: "admin_retry" },
      actor: actor || { kind: "admin", id: "retry" },
    });
  }
  const result = await tryEscrowPayoutOnRelease(order, escrow, { actor });
  return { ok: true, result, escrow };
}
