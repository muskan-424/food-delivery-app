import express from "express";
import {
  createPayment,
  processPayment,
  getUserPayments,
  getPaymentById,
  getAllPayments,
  updatePaymentStatus,
  processRefund,
  adminCreatePayment,
  adminDeletePayment
} from "../controllers/paymentController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const paymentRouter = express.Router();

// Apply idempotency to critical payment operations
const paymentIdempotency = idempotencyMiddleware({ endpoints: ['/create', '/process'] });
const adminPaymentIdempotency = idempotencyMiddleware({ endpoints: ['/admin/create', '/admin/'] });

// User routes
paymentRouter.post("/create", apiLimiter, authMiddleware, paymentIdempotency, createPayment);
paymentRouter.post("/process/:paymentId", apiLimiter, authMiddleware, paymentIdempotency, processPayment);
paymentRouter.get("/user", apiLimiter, authMiddleware, getUserPayments);
paymentRouter.get("/:paymentId", apiLimiter, authMiddleware, getPaymentById);

// Admin routes
paymentRouter.get("/admin/all", apiLimiter, authMiddleware, adminMiddleware, getAllPayments);
paymentRouter.post("/admin/create", apiLimiter, authMiddleware, adminMiddleware, adminPaymentIdempotency, adminCreatePayment);
paymentRouter.delete("/admin/:paymentId", apiLimiter, authMiddleware, adminMiddleware, adminDeletePayment);
paymentRouter.put("/admin/:paymentId/status", apiLimiter, authMiddleware, adminMiddleware, updatePaymentStatus);
paymentRouter.post("/admin/:paymentId/refund", apiLimiter, authMiddleware, adminMiddleware, adminPaymentIdempotency, processRefund);

export default paymentRouter;

