import { appConfig } from "../config/appConfig.js";

/**
 * Whether this restaurant may receive customer orders (Phase 8 KYC gate).
 * Legacy documents without kycStatus are treated as approved when gate is on.
 */
export function isRestaurantOrderable(restaurant) {
  if (!restaurant) return true;
  if (!appConfig.requireRestaurantKycForOrders) return true;
  const s = restaurant.kycStatus;
  if (s === undefined || s === null) return true;
  return s === "approved";
}

export function publicRestaurantMatchForKycGate() {
  if (!appConfig.requireRestaurantKycForOrders) return {};
  return {
    $or: [{ kycStatus: "approved" }, { kycStatus: { $exists: false } }],
  };
}
