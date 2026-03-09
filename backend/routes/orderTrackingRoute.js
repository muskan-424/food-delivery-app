import express from "express";
import { getOrderTracking, updateOrderStatus, getOrderTimeline } from "../controllers/orderTrackingController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const orderTrackingRouter = express.Router();

orderTrackingRouter.get("/:orderId", apiLimiter, authMiddleware, getOrderTracking);
orderTrackingRouter.get("/:orderId/timeline", apiLimiter, authMiddleware, getOrderTimeline);
orderTrackingRouter.put("/:orderId/status", apiLimiter, authMiddleware, updateOrderStatus); // Admin or delivery person

export default orderTrackingRouter;

