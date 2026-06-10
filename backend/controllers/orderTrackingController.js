import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import { deliveryAssignmentModel, deliveryPersonModel } from "../models/deliveryModel.js";
import { transitionOrderById } from "../services/orderTransitionService.js";
import orderEventModel from "../models/orderEventModel.js";
import {
  getEscrowByOrderId,
  listEscrowEventsByOrderId,
} from "../services/escrowService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { getMediaPublicUrl } from "../utils/mediaStorage.js";

function buildScheduleMeta(order) {
  const scheduledFor = order?.scheduledFor ? new Date(order.scheduledFor) : null;
  const now = new Date();
  const isScheduled = !!scheduledFor;
  const isScheduleDue = !!(scheduledFor && scheduledFor <= now);
  const minutesUntilScheduled =
    scheduledFor && scheduledFor > now
      ? Math.ceil((scheduledFor.getTime() - now.getTime()) / 60000)
      : 0;
  return {
    scheduledFor: order?.scheduledFor || null,
    scheduledSlotId: order?.scheduledSlot?.slotId || null,
    scheduledSlot: order?.scheduledSlot || null,
    isScheduled,
    isScheduleDue,
    minutesUntilScheduled,
  };
}

function mapItemsWithImageUrl(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    imageUrl: getMediaPublicUrl(item?.image),
  }));
}

// Get order tracking details
const getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.body.userId;

    const order = await orderModel.findOne({ 
      _id: orderId, 
      userId 
    }).populate('restaurantId', 'name image').populate('deliveryPersonId', 'name phone');

    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    const deliveryAssignment = await deliveryAssignmentModel.findOne({ orderId });

    // Calculate estimated time remaining
    let estimatedTimeRemaining = null;
    if (order.estimatedDeliveryTime) {
      const now = new Date();
      const diff = order.estimatedDeliveryTime - now;
      if (diff > 0) {
        estimatedTimeRemaining = Math.ceil(diff / 60000); // minutes
      }
    }
    const scheduleMeta = buildScheduleMeta(order);

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          statusHistory: order.statusHistory || [],
          items: mapItemsWithImageUrl(order.items),
          amount: order.finalAmount,
          address: order.address,
          estimatedDeliveryTime: order.estimatedDeliveryTime,
          estimatedTimeRemaining,
          deliveredAt: order.deliveredAt,
          ...scheduleMeta,
          menuPricedAt: order.menuPricedAt,
          deliveryEtaSnapshot: order.deliveryEtaSnapshot,
          proofOfDelivery: order.proofOfDelivery
            ? {
                method: order.proofOfDelivery.method,
                verifiedAt: order.proofOfDelivery.verifiedAt,
                note: order.proofOfDelivery.note || "",
                evidenceUrl: order.proofOfDelivery.evidenceUrl || "",
                signatureName: order.proofOfDelivery.signatureName || "",
              }
            : null,
        },
        restaurant: order.restaurantId
          ? {
              ...(order.restaurantId.toObject ? order.restaurantId.toObject() : order.restaurantId),
              imageUrl: getMediaPublicUrl(order.restaurantId.image),
            }
          : null,
        deliveryPerson: order.deliveryPersonId,
        deliveryTracking: deliveryAssignment ? {
          status: deliveryAssignment.status,
          currentLocation: deliveryAssignment.currentLocation,
          assignedAt: deliveryAssignment.assignedAt,
          acceptedAt: deliveryAssignment.acceptedAt,
          pickedUpAt: deliveryAssignment.pickedUpAt,
          deliveredAt: deliveryAssignment.deliveredAt
        } : null
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching order tracking");
  }
};

// Update order status (Admin/Delivery)
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, message } = req.body;
    const userId = req.body.userId;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return sendError(res, req, 400, "Invalid status");
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    // Check permissions (admin or delivery person assigned to order)
    // This should be handled by middleware, but adding basic check
    const user = await userModel.findById(userId);
    const isAdmin = user?.role === 'admin';
    let effectiveDeliveryPersonId = String(userId || "");
    if (user?.role === "driver") {
      const linked = await deliveryPersonModel.findOne({ linkedUserId: userId }).select("_id");
      if (linked) effectiveDeliveryPersonId = String(linked._id);
    }
    const isDeliveryPerson = order.deliveryPersonId?.toString() === effectiveDeliveryPersonId;

    if (!isAdmin && !isDeliveryPerson) {
      return sendError(res, req, 403, "Not authorized to update order status");
    }

    const updatedBy = isAdmin ? "admin" : "delivery_person";
    const result = await transitionOrderById(orderId, status, {
      message: message || `Status updated to ${status}`,
      updatedBy,
      actorUserId: userId,
      allowDeliveryAssign: isAdmin && status === "out_for_delivery",
      allowAdminCancelDelivery: isAdmin && status === "cancelled",
    });

    if (!result.ok) {
      if (result.code === "INVALID_TRANSITION") {
        return sendError(
          res,
          req,
          400,
          `Invalid status transition from ${result.from} to ${result.to}`
        );
      }
      return sendError(res, req, 404, "Order not found");
    }

    const updated = result.order;

    // Update delivery assignment if exists
    if (updated.deliveryPersonId) {
      const deliveryAssignment = await deliveryAssignmentModel.findOne({ orderId });
      if (deliveryAssignment) {
        if (status === 'out_for_delivery' && !deliveryAssignment.pickedUpAt) {
          deliveryAssignment.status = 'picked_up';
          deliveryAssignment.pickedUpAt = new Date();
        } else if (status === 'delivered') {
          deliveryAssignment.status = 'delivered';
          deliveryAssignment.deliveredAt = new Date();
        } else {
          deliveryAssignment.status = status;
        }
        await deliveryAssignment.save();
      }
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Order status updated successfully",
      data: {
        orderId: updated._id,
        status: updated.status,
        statusHistory: updated.statusHistory
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating order status");
  }
};

// Get order status timeline
const getOrderTimeline = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.body.userId;

    const order = await orderModel.findOne({ 
      _id: orderId, 
      userId 
    }).select("statusHistory status createdAt estimatedDeliveryTime deliveredAt scheduledFor scheduledSlot menuPricedAt");

    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    const events = await orderEventModel
      .find({ orderId })
      .sort({ createdAt: 1 })
      .select('type payload actor createdAt')
      .lean();

    const scheduleMeta = buildScheduleMeta(order);

    const [escrow, escrowEvents] = await Promise.all([
      getEscrowByOrderId(orderId),
      listEscrowEventsByOrderId(orderId),
    ]);

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        currentStatus: order.status,
        timeline: order.statusHistory || [],
        events,
        escrow: escrow
          ? {
              id: escrow._id,
              status: escrow.status,
              amount: escrow.amount,
              currency: escrow.currency,
              capturedAt: escrow.capturedAt,
              releasedAt: escrow.releasedAt,
            }
          : null,
        escrowEvents,
        createdAt: order.createdAt,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        deliveredAt: order.deliveredAt,
        ...scheduleMeta,
        menuPricedAt: order.menuPricedAt,
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching order timeline");
  }
};

export { getOrderTracking, updateOrderStatus, getOrderTimeline };

