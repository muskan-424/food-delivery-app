/**
 * Marketplace economics snapshot at checkout (Phase 4).
 * Commission applies to net item subtotal (after discounts, before delivery fee).
 * When menuPricesIncludeTax is on, netItemTotal is gross; commission basis is tax-exclusive portion of that total.
 */

import { exclusiveBasisFromGrossItemNet, round2 } from "../utils/menuTaxPricing.js";

/**
 * @param {*} restaurant — restaurant doc or null
 * @param {{ netItemTotal: number }} input — items total minus item-level discounts (gross if tax-inclusive menu)
 */
export function buildOrderEconomicsSnapshot(restaurant, { netItemTotal }) {
  const commissionPercent = Math.min(
    100,
    Math.max(0, Number(restaurant?.commissionPercent) || 0)
  );
  const taxRate = Math.min(
    100,
    Math.max(0, Number(restaurant?.defaultTaxRatePercent) || 0)
  );
  const taxInclusiveMenu =
    !!(restaurant?.menuPricesIncludeTax && taxRate > 0);

  const grossNet = round2(Math.max(0, netItemTotal));
  const basis = taxInclusiveMenu
    ? exclusiveBasisFromGrossItemNet(grossNet, taxRate)
    : grossNet;

  const commissionAmount = round2((basis * commissionPercent) / 100);
  const estimatedRestaurantNet = round2(basis - commissionAmount);
  const taxAmount = taxInclusiveMenu
    ? round2(Math.max(0, grossNet - basis))
    : taxRate > 0
      ? round2((basis * taxRate) / 100)
      : 0;

  return {
    commissionSnapshot: {
      percent: commissionPercent,
      basisAmount: basis,
      amount: commissionAmount,
      estimatedRestaurantNet,
    },
    taxSnapshot: {
      label:
        taxRate > 0
          ? taxInclusiveMenu
            ? "Tax included in menu price"
            : "GST"
          : "",
      ratePercent: taxRate,
      taxableBasis: basis,
      amount: taxAmount,
      taxInclusiveMenu,
    },
  };
}
