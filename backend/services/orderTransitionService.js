import orderModel from "../models/orderModel.js";
import { recordOrderEvent } from "./orderEventService.js";
import { canTransition } from "../constants/orderStatusMachine.js";
import { restoreStockForOrderItems } from "./orderStockService.js";
import { notifyOrderStatusChange } from "./notificationService.js";
import {
  accrueLoyaltyForDeliveredOrder,
  restoreLoyaltyRedemptionOnCancel,
} from "./loyaltyService.js";

/**
 * Apply a validated status change, append statusHistory, record order event (Phase 2).
 */
export async function transitionOrderById(orderId, toStatus, options = {}) {
  const {
    message = "",
    updatedBy = "system",
    actorUserId = "",
    allowDeliveryAssign = false,
    allowAdminCancelDelivery = false,
    allowReturnToReady = false,
  } = options;

  const order = await orderModel.findById(orderId);
  if (!order) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const from = order.status;
  if (
    !canTransition(from, toStatus, {
      allowDeliveryAssign,
      allowAdminCancelDelivery,
      allowReturnToReady,
    })
  ) {
    return { ok: false, code: "INVALID_TRANSITION", from, to: toStatus };
  }

  if (from === toStatus) {
    return { ok: true, order, unchanged: true };
  }

  order.status = toStatus;
  if (toStatus === "delivered") {
    order.deliveredAt = new Date();
  }

  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({
    status: toStatus,
    message: message || `Status changed to ${toStatus}`,
    timestamp: new Date(),
    updatedBy,
  });

  await order.save();

  if (toStatus === "cancelled" && from !== "cancelled") {
    if (order.inventoryReserved) {
      try {
        await restoreStockForOrderItems(order.items);
        order.inventoryReserved = false;
        await order.save();
      } catch (err) {
        console.error("restoreStockForOrderItems:", err.message);
      }
    }
    try {
      await restoreLoyaltyRedemptionOnCancel(order);
    } catch (err) {
      console.error("restoreLoyaltyRedemptionOnCancel:", err.message);
    }
  }

  await recordOrderEvent({
    orderId: order._id,
    type: "order.status_changed",
    payload: { from, to: toStatus, message },
    actor: { kind: updatedBy, id: String(actorUserId || "") },
  });

  try {
    await notifyOrderStatusChange({ order, from, to: toStatus });
  } catch (err) {
    console.error("notifyOrderStatusChange:", err.message);
  }

  if (toStatus === "delivered") {
    try {
      await accrueLoyaltyForDeliveredOrder(order);
    } catch (err) {
      console.error("accrueLoyaltyForDeliveredOrder:", err.message);
    }
  }

  return { ok: true, order };
}
