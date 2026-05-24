import { appConfig } from "../config/appConfig.js";

/**
 * @param {unknown} rawTip
 * @param {number} itemsSubtotal — pre-discount cart subtotal (server-computed items)
 */
export function sanitizeTipAmount(rawTip, itemsSubtotal) {
  const sub = Number(itemsSubtotal);
  if (!Number.isFinite(sub) || sub < 0) {
    return { error: "Invalid order subtotal for tip", tipAmount: 0 };
  }
  const t = Number(rawTip);
  const tip =
    rawTip === undefined || rawTip === null || rawTip === ""
      ? 0
      : Number.isFinite(t) && t > 0
        ? Math.round(t * 100) / 100
        : 0;
  if (tip <= 0) {
    return { tipAmount: 0 };
  }
  const pctCap =
    Math.round(sub * (appConfig.checkoutTipMaxPercentOfSubtotal / 100) * 100) / 100;
  const maxTip = Math.min(appConfig.checkoutTipMaxFixedInr, pctCap);
  if (tip > maxTip) {
    return {
      error: `Tip cannot exceed ${maxTip} for this order`,
      tipAmount: 0,
    };
  }
  return { tipAmount: tip };
}

/** Platform fee on net item total after coupon/offer discounts (before delivery, tip, loyalty). */
export function computeServiceFeeAmount(itemsNetAfterDiscount) {
  const pct = appConfig.checkoutServiceFeePercent;
  if (!pct) return 0;
  const base = Math.max(0, Number(itemsNetAfterDiscount) || 0);
  const raw = Math.round((base * pct) / 100 * 100) / 100;
  return Math.min(appConfig.checkoutServiceFeeMaxInr, raw);
}
