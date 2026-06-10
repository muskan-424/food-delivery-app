import { appConfig } from "../config/appConfig.js";
import {
  getOrderChatSessionView,
  listOrderChatMessages,
  sendOrderChatMessage,
} from "../services/orderChatService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const getOrderChatSession = async (req, res) => {
  try {
    if (!appConfig.enableOrderChat) {
      return sendError(res, req, 503, "Order chat is disabled");
    }
    const userId = req.body.userId;
    const { orderId } = req.params;
    const result = await getOrderChatSessionView(userId, orderId, {
      isAdmin: req.body.role === "admin",
    });
    if (!result.ok) {
      const code =
        result.reason === "order_not_found"
          ? 404
          : result.reason === "forbidden"
            ? 403
            : result.reason === "order_closed"
              ? 400
              : 403;
      return sendError(res, req, code, result.reason || "Access denied");
    }
    return sendSuccess(res, req, 200, { success: true, data: result.data });
  } catch (error) {
    console.error("getOrderChatSession:", error);
    return sendError(res, req, 500, "Error loading order chat session");
  }
};

export const listOrderChatMessagesHandler = async (req, res) => {
  try {
    if (!appConfig.enableOrderChat) {
      return sendError(res, req, 503, "Order chat is disabled");
    }
    const userId = req.body.userId;
    const { orderId } = req.params;
    const session = await getOrderChatSessionView(userId, orderId, {
      isAdmin: req.body.role === "admin",
    });
    if (!session.ok) {
      const code = session.reason === "order_not_found" ? 404 : 403;
      return sendError(res, req, code, session.reason || "Access denied");
    }
    const limit = Number(req.query.limit) || 50;
    const before = req.query.before || null;
    const messages = await listOrderChatMessages(orderId, { limit, before });
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        orderId: String(orderId),
        messages,
        viewerRole: session.data.viewerRole,
      },
    });
  } catch (error) {
    console.error("listOrderChatMessages:", error);
    return sendError(res, req, 500, "Error loading chat messages");
  }
};

export const postOrderChatMessage = async (req, res) => {
  try {
    if (!appConfig.enableOrderChat) {
      return sendError(res, req, 503, "Order chat is disabled");
    }
    const userId = req.body.userId;
    const { orderId } = req.params;
    const { body, locale } = req.body;
    const result = await sendOrderChatMessage({
      userId,
      orderId,
      body,
      locale,
      isAdmin: req.body.role === "admin",
    });
    if (!result.ok) {
      const code =
        result.reason === "order_not_found"
          ? 404
          : result.reason === "empty_body" || result.reason === "body_too_long"
            ? 400
            : 403;
      return sendError(res, req, code, result.reason || "Could not send message");
    }
    return sendSuccess(res, req, 201, {
      success: true,
      message: "Message sent",
      data: result.message,
    });
  } catch (error) {
    console.error("postOrderChatMessage:", error);
    return sendError(res, req, 500, "Error sending chat message");
  }
};
