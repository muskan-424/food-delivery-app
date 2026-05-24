export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Stored menu + modifier deltas are tax-exclusive; convert to what the customer pays when prices are tax-inclusive. */
export function grossUnitFromExclusive(unitExclusive, taxRatePercent) {
  const r = Number(taxRatePercent) || 0;
  if (r <= 0) return round2(unitExclusive);
  return round2(unitExclusive * (1 + r / 100));
}

/** Derive commission/tax accounting basis from gross item total (after discounts) when tax is included in menu prices. */
export function exclusiveBasisFromGrossItemNet(grossNetAfterDiscount, taxRatePercent) {
  const r = Number(taxRatePercent) || 0;
  if (r <= 0) return round2(grossNetAfterDiscount);
  return round2(grossNetAfterDiscount / (1 + r / 100));
}
