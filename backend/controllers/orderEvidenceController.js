import orderModel from "../models/orderModel.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

function serializeEvidence(order, { isAdmin = false } = {}) {
  const pod = order.proofOfDelivery || {};
  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    proofOfDelivery: {
      method: pod.method || "none",
      verifiedAt: pod.verifiedAt || null,
      uploadedAt: pod.uploadedAt || null,
      note: pod.note || "",
      evidenceUrl: pod.evidenceUrl || "",
      beforeImageUrl: pod.beforeImageUrl || "",
      afterImageUrl: pod.afterImageUrl || "",
      signatureName: pod.signatureName || "",
      evidenceJson: isAdmin ? pod.evidenceJson || null : undefined,
    },
    deliveryVerificationResult: order.deliveryVerificationResult || null,
  };
}

async function canViewEvidence(req, order) {
  const userId = String(req.body.userId || "");
  const role = String(req.body.role || "");
  if (role === "admin") return true;
  if (String(order.userId) === userId) return true;

  if (order.restaurantId) {
    const userModel = (await import("../models/userModel.js")).default;
    const user = await userModel.findById(userId).select("restaurantStaff");
    if (
      user?.restaurantStaff?.active &&
      String(user.restaurantStaff.restaurantId) === String(order.restaurantId)
    ) {
      return true;
    }
  }
  return false;
}

export const getOrderEvidence = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await orderModel.findById(orderId);
    if (!order) return sendError(res, req, 404, "Order not found");

    const allowed = await canViewEvidence(req, order);
    if (!allowed) return sendError(res, req, 403, "Access denied");

    return sendSuccess(res, req, 200, {
      success: true,
      data: serializeEvidence(order, { isAdmin: req.body.role === "admin" }),
    });
  } catch (error) {
    console.error("getOrderEvidence:", error);
    return sendError(res, req, 500, "Error loading order evidence");
  }
};
