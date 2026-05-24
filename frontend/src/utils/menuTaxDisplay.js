export function grossFromExclusive(unitExclusive, restaurantMenuTax) {
  const ex = Number(unitExclusive) || 0;
  const r = Number(restaurantMenuTax?.defaultTaxRatePercent) || 0;
  if (!restaurantMenuTax?.menuPricesIncludeTax || r <= 0) return ex;
  return Math.round(ex * (1 + r / 100) * 100) / 100;
}
