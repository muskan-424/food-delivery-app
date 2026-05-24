import notificationModel from "../models/notificationModel.js";
import { broadcastToUser } from "../realtime/sseHub.js";
import { broadcastWsToUser } from "../realtime/wsHub.js";
import { getGeneralQueue } from "../jobs/queue.js";

export async function notifyOrderStatusChange({ order, from, to }) {
  const userId = String(order.userId);
  const doc = await notificationModel.create({
    userId,
    title: "Order update",
    body: `Order ${order.orderNumber} is now ${to}`,
    type: "order_status",
    refType: "order",
    refId: String(order._id),
    metadata: { from, to, orderNumber: order.orderNumber },
  });

  const payload = doc.toObject();
  broadcastToUser(userId, { type: "notification", data: payload });
  broadcastWsToUser(userId, "notification", payload);
  broadcastToUser(userId, {
    type: "order.status",
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    from,
    to,
  });
  broadcastWsToUser(userId, "order.status", {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    from,
    to,
  });

  const queue = getGeneralQueue();
  if (queue) {
    queue
      .add(
        "notification.outbound",
        {
          userId,
          notificationId: String(doc._id),
          kind: "order_status",
        },
        {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      )
      .catch((err) =>
        console.error("notification.outbound queue:", err.message)
      );
  }

  return doc;
}

export async function listNotifications(userId, { page = 1, limit = 20 } = {}) {
  const lim = Math.min(Math.max(1, limit), 100);
  const skip = (Math.max(1, page) - 1) * lim;
  const [items, total] = await Promise.all([
    notificationModel
      .find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean(),
    notificationModel.countDocuments({ userId: String(userId) }),
  ]);
  return {
    items,
    pagination: {
      page,
      limit: lim,
      total,
      totalPages: Math.ceil(total / lim) || 0,
    },
  };
}

export async function markNotificationRead(userId, notificationId) {
  const result = await notificationModel.updateOne(
    { _id: notificationId, userId: String(userId) },
    { $set: { read: true } }
  );
  return result.matchedCount > 0;
}

export async function markAllNotificationsRead(userId) {
  await notificationModel.updateMany(
    { userId: String(userId), read: false },
    { $set: { read: true } }
  );
}

export async function countUnread(userId) {
  return notificationModel.countDocuments({
    userId: String(userId),
    read: false,
  });
}
