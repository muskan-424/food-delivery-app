import express from "express";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  getOrderChatSession,
  listOrderChatMessagesHandler,
  postOrderChatMessage,
} from "../controllers/orderChatController.js";

const orderChatRouter = express.Router();

orderChatRouter.get("/:orderId/session", apiLimiter, authMiddleware, getOrderChatSession);
orderChatRouter.get("/:orderId/messages", apiLimiter, authMiddleware, listOrderChatMessagesHandler);
orderChatRouter.post("/:orderId/messages", apiLimiter, authMiddleware, postOrderChatMessage);

export default orderChatRouter;
