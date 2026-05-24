import userModel from "../models/userModel.js";
import foodModel from "../models/foodModel.js";
import orderModel from "../models/orderModel.js";
import { sendError } from "../utils/apiResponse.js";

function toStr(v) {
  return v == null ? "" : String(v);
}

async function resolveRestaurantIdForRequest(req) {
  if (req.query?.restaurantId) return toStr(req.query.restaurantId);
  if (req.body?.restaurantId) return toStr(req.body.restaurantId);
  if (req.params?.restaurantId) return toStr(req.params.restaurantId);
  if (req.body?.orderId) {
    const order = await orderModel.findById(req.body.orderId).select("restaurantId").lean();
    return order?.restaurantId ? toStr(order.restaurantId) : "";
  }
  if (req.params?.orderId) {
    const order = await orderModel.findById(req.params.orderId).select("restaurantId").lean();
    return order?.restaurantId ? toStr(order.restaurantId) : "";
  }
  if (req.params?.foodId) {
    const food = await foodModel.findById(req.params.foodId).select("restaurantId").lean();
    return food?.restaurantId ? toStr(food.restaurantId) : "";
  }
  if (req.body?.id) {
    const food = await foodModel.findById(req.body.id).select("restaurantId").lean();
    return food?.restaurantId ? toStr(food.restaurantId) : "";
  }
  return "";
}

export function requireRestaurantPermission(permission) {
  return async (req, res, next) => {
    try {
      const userId = req.body?.userId;
      if (!userId) return sendError(res, req, 401, "Not Authorized Login Again");

      const user = await userModel
        .findById(userId)
        .select("role restaurantStaff")
        .lean();
      if (!user) return sendError(res, req, 401, "User not found");

      if (user.role === "admin") return next();

      const staff = user.restaurantStaff || {};
      const perms = Array.isArray(staff.permissions) ? staff.permissions : [];
      const isActive = staff.active !== false;
      if (!isActive || !perms.includes(permission)) {
        return sendError(res, req, 403, "Restaurant staff permission denied");
      }

      /** Read-only finance: partner payout list/detail without restaurantId in URL */
      if (
        permission === "finance.read" &&
        req.method === "GET" &&
        !(await resolveRestaurantIdForRequest(req))
      ) {
        const staffRestaurantId = toStr(staff.restaurantId);
        if (!staffRestaurantId) {
          return sendError(res, req, 403, "Access denied for this restaurant");
        }
        req.partnerRestaurantId = staffRestaurantId;
        req.body.staffRestaurantId = staffRestaurantId;
        return next();
      }

      const targetRestaurantId = await resolveRestaurantIdForRequest(req);
      const staffRestaurantId = toStr(staff.restaurantId);
      if (!staffRestaurantId) {
        return sendError(res, req, 403, "Access denied for this restaurant");
      }
      if (!targetRestaurantId && permission === "order.manage" && req.method === "GET") {
        req.query.restaurantId = staffRestaurantId;
        req.body.staffRestaurantId = staffRestaurantId;
        return next();
      }
      if (!targetRestaurantId || targetRestaurantId !== staffRestaurantId) {
        return sendError(res, req, 403, "Access denied for this restaurant");
      }

      req.body.staffRestaurantId = staffRestaurantId;
      return next();
    } catch (error) {
      console.error("requireRestaurantPermission:", error);
      return sendError(res, req, 500, "Error checking restaurant staff permissions");
    }
  };
}

