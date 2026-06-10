/**
 * Extract client IP and user-agent for audit / security logs.
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "";
}

export function getUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 512);
}
