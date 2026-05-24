/**
 * Valid order fulfillment statuses (Phase 2).
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

/** Normal forward flow */
const FORWARD = {
  pending: ["confirmed"],
  confirmed: ["preparing"],
  preparing: ["ready"],
  ready: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * @param {string} from
 * @param {string} to
 * @param {object} [options]
 * @param {boolean} [options.allowDeliveryAssign] — jump to out_for_delivery from pre-ready states (admin assigns driver)
 * @param {boolean} [options.allowAdminCancelDelivery] — cancel while out_for_delivery (admin only)
 * @param {boolean} [options.allowReturnToReady] — driver rejects assignment (out_for_delivery → ready)
 */
export function canTransition(from, to, options = {}) {
  if (!ORDER_STATUSES.includes(to)) return false;
  if (from === to) return true;

  if (options.allowReturnToReady && to === "ready" && from === "out_for_delivery") {
    return true;
  }

  if (to === "cancelled") {
    if (["delivered", "cancelled"].includes(from)) return false;
    if (from === "out_for_delivery" && !options.allowAdminCancelDelivery) return false;
    return true;
  }

  if (options.allowDeliveryAssign && to === "out_for_delivery") {
    return ["pending", "confirmed", "preparing", "ready"].includes(from);
  }

  const allowed = FORWARD[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function listAllowedNextStatuses(from, options = {}) {
  return ORDER_STATUSES.filter((to) => canTransition(from, to, options));
}
