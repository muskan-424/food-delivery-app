import express from "express";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { requireRestaurantPermission } from "../middleware/restaurantStaffMiddleware.js";
import { listOrders, placeOrder, updateStatus, userOrders, verifyOrder, cancelOrder, createOrder, deleteOrder, getDynamicPricingQuote, getScheduledOrderSummary, triggerScheduledOrderAdvancement, getCheckoutHints } from "../controllers/orderController.js";
import { validateOrder, validateStatusUpdate, validateVerifyOrder } from "../middleware/validators.js";
import { orderLimiter, apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";
import { getOrderTracking, getOrderTimeline } from "../controllers/orderTrackingController.js";
import { orderPlacementVelocityGuard } from "../middleware/velocityGuard.js";
import {
  createGroupOrderSession,
  joinGroupOrderSession,
  leaveGroupOrderSession,
  getGroupOrderSession,
  listMyGroupOrderSessions,
  setGroupSplitPlan,
  closeGroupOrderSession,
  getMyGroupSplitShare,
  initializeGroupSplitPayments,
  markMyGroupSplitPaid,
  getGroupSplitPaymentsSummary,
} from "../controllers/groupOrderController.js";

const orderRouter = express.Router();

// Apply idempotency to order placement (most critical endpoint)
const orderIdempotency = idempotencyMiddleware({ endpoints: ['/place'] });

orderRouter.get("/checkout-hints", apiLimiter, getCheckoutHints);
orderRouter.post("/place", orderLimiter, authMiddleware, orderPlacementVelocityGuard, validateOrder, orderIdempotency, placeOrder);
orderRouter.post("/verify", apiLimiter, validateVerifyOrder, verifyOrder);
orderRouter.post(
  "/status",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("order.manage"),
  validateStatusUpdate,
  updateStatus
);
orderRouter.post("/userorders", apiLimiter, authMiddleware, userOrders);
orderRouter.post("/cancel", apiLimiter, authMiddleware, cancelOrder);
// Apply idempotency to admin order creation
const adminOrderIdempotency = idempotencyMiddleware({ endpoints: ['/create'] });

orderRouter.get(
  "/list",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("order.manage"),
  listOrders
);
orderRouter.get(
  "/scheduled/summary",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("order.manage"),
  getScheduledOrderSummary
);
orderRouter.post(
  "/scheduled/advance",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  triggerScheduledOrderAdvancement
);
orderRouter.post("/create", apiLimiter, authMiddleware, adminMiddleware, adminOrderIdempotency, createOrder);
orderRouter.delete("/:orderId", apiLimiter, authMiddleware, adminMiddleware, deleteOrder);
orderRouter.get("/dynamic-pricing", apiLimiter, getDynamicPricingQuote);
orderRouter.post("/group/create", apiLimiter, authMiddleware, createGroupOrderSession);
orderRouter.post("/group/join", apiLimiter, authMiddleware, joinGroupOrderSession);
orderRouter.get("/group/mine/list", apiLimiter, authMiddleware, listMyGroupOrderSessions);
orderRouter.get("/group/:sessionId", apiLimiter, authMiddleware, getGroupOrderSession);
orderRouter.post("/group/:sessionId/leave", apiLimiter, authMiddleware, leaveGroupOrderSession);
orderRouter.post("/group/:sessionId/split-plan", apiLimiter, authMiddleware, setGroupSplitPlan);
orderRouter.post(
  "/group/:sessionId/split-payments/init",
  apiLimiter,
  authMiddleware,
  initializeGroupSplitPayments
);
orderRouter.get(
  "/group/:sessionId/split-payments",
  apiLimiter,
  authMiddleware,
  getGroupSplitPaymentsSummary
);
orderRouter.get("/group/:sessionId/my-share", apiLimiter, authMiddleware, getMyGroupSplitShare);
orderRouter.post("/group/:sessionId/my-share/pay", apiLimiter, authMiddleware, markMyGroupSplitPaid);
orderRouter.post("/group/:sessionId/close", apiLimiter, authMiddleware, closeGroupOrderSession);
orderRouter.get("/:orderId/tracking", apiLimiter, authMiddleware, getOrderTracking);
orderRouter.get("/:orderId/timeline", apiLimiter, authMiddleware, getOrderTimeline);

export default orderRouter;