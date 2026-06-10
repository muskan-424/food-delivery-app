const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function normalizeIfsc(ifsc) {
  return String(ifsc || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isValidIfsc(ifsc) {
  return IFSC_REGEX.test(normalizeIfsc(ifsc));
}

export function normalizeAccountNumber(accountNumber) {
  return String(accountNumber || "").trim().replace(/\s+/g, "");
}

export function accountLast4(accountNumber) {
  const n = normalizeAccountNumber(accountNumber);
  if (n.length < 4) return "";
  return n.slice(-4);
}
