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
  adminDeletePayment,
  getWalletBalance,
  getWalletLedger,
  createRazorpayCheckoutOrder,
  verifyRazorpayPayment,
  getPaymentReconciliationDaily,
  exportPaymentReconciliationDailyCsv,
  exportPaymentReconciliationIssuesCsv,
} from "../controllers/paymentController.js";
import {
  registerRazorpayPayoutBank,
  getRazorpayPayoutStatus,
  adminInitiateEscrowPayout,
  adminOverrideEscrowPayoutFraud,
} from "../controllers/escrowPayoutController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";
import {
  validateRazorpayCreateOrder,
  validateRazorpayVerifyPayment,
} from "../middleware/validators.js";

const paymentRouter = express.Router();

// Apply idempotency to critical payment operations
const paymentIdempotency = idempotencyMiddleware({
  endpoints: ["/create", "/process", "/razorpay/create-order", "/razorpay/verify"],
});
const adminPaymentIdempotency = idempotencyMiddleware({ endpoints: ['/admin/create', '/admin/'] });

// User routes (register /razorpay/* before /:paymentId)
paymentRouter.post(
  "/razorpay/create-order",
  apiLimiter,
  authMiddleware,
  validateRazorpayCreateOrder,
  paymentIdempotency,
  createRazorpayCheckoutOrder
);
paymentRouter.post(
  "/razorpay/verify",
  apiLimiter,
  authMiddleware,
  validateRazorpayVerifyPayment,
  paymentIdempotency,
  verifyRazorpayPayment
);
paymentRouter.post(
  "/razorpay/payout/register-bank",
  apiLimiter,
  authMiddleware,
  registerRazorpayPayoutBank
);
paymentRouter.get(
  "/razorpay/payout/status",
  apiLimiter,
  authMiddleware,
  getRazorpayPayoutStatus
);
paymentRouter.post(
  "/razorpay/payout/initiate-escrow",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  adminInitiateEscrowPayout
);
paymentRouter.post(
  "/razorpay/payout/override-fraud-block",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  adminOverrideEscrowPayoutFraud
);
paymentRouter.post("/create", apiLimiter, authMiddleware, paymentIdempotency, createPayment);
paymentRouter.post("/process/:paymentId", apiLimiter, authMiddleware, paymentIdempotency, processPayment);
paymentRouter.get("/wallet/balance", apiLimiter, authMiddleware, getWalletBalance);
paymentRouter.get("/wallet/ledger", apiLimiter, authMiddleware, getWalletLedger);
paymentRouter.get("/user", apiLimiter, authMiddleware, getUserPayments);

// Admin routes (before /:paymentId so "admin" is not captured as paymentId)
paymentRouter.get("/admin/all", apiLimiter, authMiddleware, adminMiddleware, getAllPayments);
paymentRouter.post("/admin/create", apiLimiter, authMiddleware, adminMiddleware, adminPaymentIdempotency, adminCreatePayment);
paymentRouter.delete("/admin/:paymentId", apiLimiter, authMiddleware, adminMiddleware, adminDeletePayment);
paymentRouter.put("/admin/:paymentId/status", apiLimiter, authMiddleware, adminMiddleware, updatePaymentStatus);
paymentRouter.post("/admin/:paymentId/refund", apiLimiter, authMiddleware, adminMiddleware, adminPaymentIdempotency, processRefund);
paymentRouter.get(
  "/admin/reconciliation/daily",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getPaymentReconciliationDaily
);
paymentRouter.get(
  "/admin/reconciliation/daily.csv",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  exportPaymentReconciliationDailyCsv
);
paymentRouter.get(
  "/admin/reconciliation/issues.csv",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  exportPaymentReconciliationIssuesCsv
);

paymentRouter.get("/:paymentId", apiLimiter, authMiddleware, getPaymentById);

export default paymentRouter;

