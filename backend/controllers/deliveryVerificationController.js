import orderModel from "../models/orderModel.js";
import { runDeliveryVerificationForOrder, scoreDeliveryVerification } from "../services/deliveryVerificationService.js";
import { writeAudit } from "../services/auditService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { appConfig } from "../config/appConfig.js";

async function canVerifyOrder(req, order) {
  const userId = String(req.body.userId || "");
  const role = String(req.body.role || "");

  if (role === "admin") return true;
  if (String(order.userId) === userId) return false;

  if (order.restaurantId) {
    const user = await import("../models/userModel.js").then((m) =>
      m.default.findById(userId).select("restaurantStaff role")
    );
    if (user?.restaurantStaff?.active) {
      const rid = String(user.restaurantStaff.restaurantId || "");
      if (rid === String(order.restaurantId)) {
        const perms = user.restaurantStaff.permissions || [];
        if (perms.includes("order.manage") || perms.includes("restaurant.manage")) {
          return true;
        }
      }
    }
  }

  const { deliveryAssignmentModel } = await import("../models/deliveryModel.js");
  const assignment = await deliveryAssignmentModel
    .findOne({ orderId: order._id })
    .select("deliveryPersonId")
    .lean();
  if (assignment) {
    const { deliveryPersonModel } = await import("../models/deliveryModel.js");
    const dp = await deliveryPersonModel.findById(assignment.deliveryPersonId).select("linkedUserId");
    if (dp && String(dp.linkedUserId || "") === userId) return true;
  }

  return false;
}

export const verifyOrderDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await orderModel.findById(orderId);
    if (!order) return sendError(res, req, 404, "Order not found");

    const allowed = await canVerifyOrder(req, order);
    if (!allowed && req.body.role !== "admin") {
      return sendError(res, req, 403, "Not allowed to verify this delivery");
    }

    if (order.status !== "delivered") {
      return sendError(res, req, 400, "Order must be delivered before verification");
    }

    const result = await runDeliveryVerificationForOrder(orderId, {
      actorId: req.body.userId,
      actorKind: req.body.role === "admin" ? "admin" : "staff",
    });

    await writeAudit(req, {
      userId: req.body.userId,
      action: "delivery.verification",
      resourceType: "order",
      resourceId: String(orderId),
      meta: { outcome: result.verification?.outcome },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Delivery verification completed",
      data: {
        verification: result.verification,
        deliveryVerificationResult: result.order?.deliveryVerificationResult,
        escrow: result.escrow,
        escrowEnabled: appConfig.enableEscrowPayments,
      },
    });
  } catch (error) {
    console.error("verifyOrderDelivery:", error);
    return sendError(res, req, 500, "Error verifying delivery");
  }
};

export const previewOrderDeliveryVerification = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await orderModel.findById(orderId);
    if (!order) return sendError(res, req, 404, "Order not found");
    const score = scoreDeliveryVerification(order);
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        score,
        existing: order.deliveryVerificationResult || null,
      },
    });
  } catch (error) {
    console.error("previewOrderDeliveryVerification:", error);
    return sendError(res, req, 500, "Error previewing verification");
  }
};
