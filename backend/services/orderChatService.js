import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import { deliveryAssignmentModel, deliveryPersonModel } from "../models/deliveryModel.js";
import orderChatSessionModel from "../models/orderChatSessionModel.js";
import orderChatMessageModel from "../models/orderChatMessageModel.js";
import { appConfig } from "../config/appConfig.js";
import { broadcastToOrderRoom } from "../realtime/wsHub.js";

const CLOSED_ORDER_STATUSES = new Set(["cancelled"]);

async function resolveSenderRole(userId, order, { isAdmin = false } = {}) {
  if (isAdmin) return "admin";
  if (String(order.userId) === String(userId)) return "customer";

  if (order.restaurantId) {
    const user = await userModel.findById(userId).select("restaurantStaff");
    if (
      user?.restaurantStaff?.active &&
      String(user.restaurantStaff.restaurantId) === String(order.restaurantId)
    ) {
      return "restaurant_staff";
    }
  }

  const linked = await deliveryPersonModel.findOne({ linkedUserId: userId }).select("_id");
  const deliveryPersonId = linked?._id ? String(linked._id) : null;
  if (deliveryPersonId) {
    const assignment = await deliveryAssignmentModel
      .findOne({ orderId: order._id, deliveryPersonId })
      .select("_id");
    if (assignment) return "delivery";
  }

  return null;
}

export async function canAccessOrderChat(userId, orderId, { isAdmin = false } = {}) {
  if (!appConfig.enableOrderChat) {
    return { ok: false, reason: "disabled" };
  }
  const order = await orderModel.findById(orderId).select("userId restaurantId status");
  if (!order) return { ok: false, reason: "order_not_found" };
  if (CLOSED_ORDER_STATUSES.has(String(order.status))) {
    return { ok: false, reason: "order_closed" };
  }
  const role = await resolveSenderRole(userId, order, { isAdmin });
  if (!role) return { ok: false, reason: "forbidden" };
  return { ok: true, order, role };
}

export async function ensureOrderChatSession(order) {
  let session = await orderChatSessionModel.findOne({ orderId: order._id });
  if (session) return session;
  session = await orderChatSessionModel.create({
    orderId: order._id,
    customerUserId: String(order.userId),
    restaurantId: order.restaurantId || null,
    status: "active",
  });
  return session;
}

function stubTranslate(body, locale) {
  const loc = String(locale || "").trim().toLowerCase();
  if (!loc || loc === "en") {
    return { translatedBody: "", translationStatus: "skipped" };
  }
  return { translatedBody: "", translationStatus: "pending" };
}

export async function listOrderChatMessages(orderId, { limit = 50, before } = {}) {
  const cap = Math.min(100, Math.max(1, Number(limit) || 50));
  const filter = { orderId };
  if (before) {
    filter.createdAt = { $lt: new Date(before) };
  }
  const rows = await orderChatMessageModel
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();
  return rows.reverse();
}

export async function sendOrderChatMessage({
  userId,
  orderId,
  body,
  locale,
  isAdmin = false,
}) {
  const access = await canAccessOrderChat(userId, orderId, { isAdmin });
  if (!access.ok) return { ok: false, reason: access.reason };

  const text = String(body || "").trim();
  if (text.length < 1) return { ok: false, reason: "empty_body" };
  if (text.length > 4000) return { ok: false, reason: "body_too_long" };

  const session = await ensureOrderChatSession(access.order);
  const translation = stubTranslate(text, locale);

  const message = await orderChatMessageModel.create({
    sessionId: session._id,
    orderId: access.order._id,
    senderUserId: String(userId),
    senderRole: access.role,
    body: text,
    locale: String(locale || ""),
    translatedBody: translation.translatedBody,
    translationStatus: translation.translationStatus,
  });

  session.lastMessageAt = message.createdAt;
  session.messageCount = (session.messageCount || 0) + 1;
  await session.save();

  const payload = {
    id: String(message._id),
    orderId: String(orderId),
    sessionId: String(session._id),
    senderUserId: String(userId),
    senderRole: access.role,
    body: text,
    locale: message.locale,
    translatedBody: message.translatedBody,
    translationStatus: message.translationStatus,
    createdAt: message.createdAt,
  };

  broadcastToOrderRoom(orderId, "order.chat.message", payload);

  return { ok: true, message: payload, session };
}

export async function getOrderChatSessionView(userId, orderId, { isAdmin = false } = {}) {
  const access = await canAccessOrderChat(userId, orderId, { isAdmin });
  if (!access.ok) return { ok: false, reason: access.reason };
  const session = await ensureOrderChatSession(access.order);
  return {
    ok: true,
    data: {
      sessionId: String(session._id),
      orderId: String(orderId),
      status: session.status,
      messageCount: session.messageCount || 0,
      lastMessageAt: session.lastMessageAt,
      viewerRole: access.role,
    },
  };
}
