/**
 * Campaign / segment targeting (Phase 7). Coupons may require all listed tags on the user.
 */

export function normalizeSegmentTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = new Set();
  for (const t of tags) {
    const s = String(t).trim().toLowerCase();
    if (s) out.add(s);
  }
  return [...out];
}

/**
 * @param {string[]|undefined} userSegmentTags
 * @param {{ requiredSegmentTags?: string[] }} coupon
 */
export function userMatchesCouponSegments(userSegmentTags, coupon) {
  const required = coupon?.requiredSegmentTags;
  if (!required || !Array.isArray(required) || required.length === 0) {
    return true;
  }
  const userSet = new Set(normalizeSegmentTags(userSegmentTags));
  for (const r of required) {
    const key = String(r).trim().toLowerCase();
    if (!key || !userSet.has(key)) return false;
  }
  return true;
}
