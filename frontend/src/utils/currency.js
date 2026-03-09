const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (amount = 0) => {
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || !Number.isFinite(numericAmount)) {
    return formatter.format(0);
  }
  return formatter.format(numericAmount);
};


