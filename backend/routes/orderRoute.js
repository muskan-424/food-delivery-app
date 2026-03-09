import express from "express";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { listOrders, placeOrder, updateStatus, userOrders, verifyOrder, cancelOrder, createOrder, deleteOrder } from "../controllers/orderController.js";
import { validateOrder, validateStatusUpdate, validateVerifyOrder } from "../middleware/validators.js";
import { orderLimiter, apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";
import { getOrderTracking, getOrderTimeline } from "../controllers/orderTrackingController.js";

const orderRouter = express.Router();

// Apply idempotency to order placement (most critical endpoint)
const orderIdempotency = idempotencyMiddleware({ endpoints: ['/place'] });

orderRouter.post("/place", orderLimiter, authMiddleware, validateOrder, orderIdempotency, placeOrder);
orderRouter.post("/verify", apiLimiter, validateVerifyOrder, verifyOrder);
orderRouter.post("/status", apiLimiter, authMiddleware, adminMiddleware, validateStatusUpdate, updateStatus);
orderRouter.post("/userorders", apiLimiter, authMiddleware, userOrders);
orderRouter.post("/cancel", apiLimiter, authMiddleware, cancelOrder);
// Apply idempotency to admin order creation
const adminOrderIdempotency = idempotencyMiddleware({ endpoints: ['/create'] });

orderRouter.get("/list", apiLimiter, authMiddleware, adminMiddleware, listOrders);
orderRouter.post("/create", apiLimiter, authMiddleware, adminMiddleware, adminOrderIdempotency, createOrder);
orderRouter.delete("/:orderId", apiLimiter, authMiddleware, adminMiddleware, deleteOrder);
orderRouter.get("/:orderId/tracking", apiLimiter, authMiddleware, getOrderTracking);
orderRouter.get("/:orderId/timeline", apiLimiter, authMiddleware, getOrderTimeline);

export default orderRouter;