/** Indian PAN: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F) */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function normalizePan(pan) {
  return String(pan || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isValidPan(pan) {
  return PAN_REGEX.test(normalizePan(pan));
}

export function panLast4(pan) {
  const p = normalizePan(pan);
  if (p.length !== 10) return "";
  return p.slice(5, 9);
}
