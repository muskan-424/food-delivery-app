import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Days until balance expiry; 0 = feature off (no expiry date set by jobs). Env: LOYALTY_EXPIRY_DAYS */
export function getLoyaltyExpiryDays() {
  const d = Number(process.env.LOYALTY_EXPIRY_DAYS);
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : 0;
}

export function computeLoyaltyExpiryDateFromNow() {
  const days = getLoyaltyExpiryDays();
  if (days <= 0) return null;
  return new Date(Date.now() + days * 86400000);
}

/**
 * Rolling expiry: any earn extends the deadline for the entire current balance.
 */
export async function extendLoyaltyBalanceExpiry(userId) {
  const exp = computeLoyaltyExpiryDateFromNow();
  if (!exp) return;
  await userModel.updateOne({ _id: userId }, { $set: { loyaltyBalanceExpiresAt: exp } });
}

/**
 * Daily job: zero balances whose expiry has passed.
 */
export async function runLoyaltyExpirySweep() {
  const days = getLoyaltyExpiryDays();
  if (days <= 0) {
    return { ran: false, expiredUsers: 0 };
  }
  const now = new Date();
  const res = await userModel.updateMany(
    {
      loyaltyPoints: { $gt: 0 },
      loyaltyBalanceExpiresAt: { $lte: now },
    },
    { $set: { loyaltyPoints: 0, loyaltyBalanceExpiresAt: null } }
  );
  return { ran: true, expiredUsers: res.modifiedCount ?? 0 };
}

/**
 * Redeem loyalty points at place-order: max fraction of order total, ₹ per point from env.
 * Debits user before order save; caller must refund points if order save fails.
 */
export async function redeemLoyaltyPointsAtCheckout(userId, pointsRequested, baseTotalInr) {
  const raw = Number(pointsRequested);
  const reqPts = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  if (reqPts <= 0) {
    return { ok: true, pointsUsed: 0, redeemInr: 0 };
  }

  const inrPerPointEnv = Number(process.env.LOYALTY_REDEEM_INR_PER_POINT);
  const redeemInrPerPoint =
    Number.isFinite(inrPerPointEnv) && inrPerPointEnv > 0 ? inrPerPointEnv : 1;

  const fracEnv = Number(process.env.LOYALTY_MAX_REDEEM_FRACTION);
  const maxFrac =
    Number.isFinite(fracEnv) && fracEnv > 0 && fracEnv <= 1 ? fracEnv : 0.5;

  const base = round2(Math.max(0, baseTotalInr));
  const maxDiscountInr = round2(Math.min(base * maxFrac, base));
  const maxPointsByCap = Math.floor(maxDiscountInr / redeemInrPerPoint + 1e-9);
  const desiredPoints = Math.min(reqPts, maxPointsByCap);
  if (desiredPoints <= 0) {
    return { ok: true, pointsUsed: 0, redeemInr: 0 };
  }

  const user = await userModel.findById(userId).select("loyaltyPoints");
  const balance = Math.floor(Number(user?.loyaltyPoints) || 0);
  const pointsToUse = Math.min(desiredPoints, balance);
  if (pointsToUse <= 0) {
    return {
      ok: false,
      code: "INSUFFICIENT_LOYALTY_POINTS",
      message: "Not enough loyalty points for this redemption",
    };
  }

  const updated = await userModel.findOneAndUpdate(
    { _id: userId, loyaltyPoints: { $gte: pointsToUse } },
    { $inc: { loyaltyPoints: -pointsToUse } },
    { new: true }
  );
  if (!updated) {
    return {
      ok: false,
      code: "INSUFFICIENT_LOYALTY_POINTS",
      message: "Not enough loyalty points for this redemption",
    };
  }

  const redeemInr = round2(
    Math.min(pointsToUse * redeemInrPerPoint, base, maxDiscountInr)
  );
  return { ok: true, pointsUsed: pointsToUse, redeemInr };
}

export async function previewLoyaltyRedemption(userId, pointsRequested, baseTotalInr) {
  const user = await userModel.findById(userId).select("loyaltyPoints loyaltyBalanceExpiresAt");
  const balance = Math.max(0, Math.floor(Number(user?.loyaltyPoints) || 0));
  const base = round2(Math.max(0, Number(baseTotalInr) || 0));
  const requestedRaw = Number(pointsRequested);
  const requested = Number.isFinite(requestedRaw) && requestedRaw > 0 ? Math.floor(requestedRaw) : 0;

  const inrPerPointEnv = Number(process.env.LOYALTY_REDEEM_INR_PER_POINT);
  const redeemInrPerPoint =
    Number.isFinite(inrPerPointEnv) && inrPerPointEnv > 0 ? inrPerPointEnv : 1;
  const fracEnv = Number(process.env.LOYALTY_MAX_REDEEM_FRACTION);
  const maxFrac = Number.isFinite(fracEnv) && fracEnv > 0 && fracEnv <= 1 ? fracEnv : 0.5;
  const maxDiscountInr = round2(Math.min(base * maxFrac, base));
  const maxPointsByCap = Math.floor(maxDiscountInr / redeemInrPerPoint + 1e-9);
  const maxRedeemablePoints = Math.min(balance, maxPointsByCap);
  const pointsToUse =
    requested > 0 ? Math.min(requested, maxRedeemablePoints) : maxRedeemablePoints;
  const redeemInr = round2(pointsToUse * redeemInrPerPoint);
  return {
    balancePoints: balance,
    loyaltyBalanceExpiresAt: user?.loyaltyBalanceExpiresAt || null,
    redeemInrPerPoint,
    maxFraction: maxFrac,
    baseTotalInr: base,
    maxRedeemablePoints,
    pointsToUse,
    redeemInr: Math.min(redeemInr, maxDiscountInr, base),
  };
}

export async function refundLoyaltyPoints(userId, points) {
  const p = Math.floor(Number(points) || 0);
  if (p <= 0) return;
  await userModel.updateOne({ _id: userId }, { $inc: { loyaltyPoints: p } });
  await extendLoyaltyBalanceExpiry(userId);
}

/**
 * Restore points debited at checkout when order is cancelled (before delivery accrual).
 */
export async function restoreLoyaltyRedemptionOnCancel(order) {
  const pts = Math.floor(Number(order.loyaltyPointsRedeemed) || 0);
  if (pts <= 0) return;
  await userModel.updateOne(
    { _id: order.userId },
    { $inc: { loyaltyPoints: pts } }
  );
  await extendLoyaltyBalanceExpiry(order.userId);
}

/**
 * Accrue loyalty points when order is delivered (Phase 7). Idempotent.
 * Points = max(1, floor(finalAmount * rate)); rate from LOYALTY_POINTS_PER_INR (default 0.01 = 1 pt / ₹100).
 */
export async function accrueLoyaltyForDeliveredOrder(order) {
  if (order.loyaltyAccruedAt) {
    return { skipped: true, points: order.loyaltyPointsEarned ?? 0 };
  }

  const rate = Number(process.env.LOYALTY_POINTS_PER_INR);
  const pointsPerInr = Number.isFinite(rate) && rate >= 0 ? rate : 0.01;
  const finalAmt = Number(order.finalAmount) || 0;
  const points = Math.max(1, Math.floor(finalAmt * pointsPerInr));

  const exp = computeLoyaltyExpiryDateFromNow();
  const userUpdate =
    exp != null
      ? {
          $inc: { loyaltyPoints: points },
          $set: { loyaltyBalanceExpiresAt: exp },
        }
      : { $inc: { loyaltyPoints: points } };

  await userModel.updateOne({ _id: order.userId }, userUpdate);

  await orderModel.updateOne(
    { _id: order._id },
    {
      $set: {
        loyaltyPointsEarned: points,
        loyaltyAccruedAt: new Date(),
      },
    }
  );

  return { skipped: false, points };
}
