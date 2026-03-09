import express from "express";
import { getCoupons, getAvailableCoupons, validateCoupon, createCoupon, getAllCoupons, updateCoupon, deleteCoupon } from "../controllers/couponController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const couponRouter = express.Router();

// Apply idempotency to coupon operations
const couponIdempotency = idempotencyMiddleware({ endpoints: ['/validate'] });
const adminCouponIdempotency = idempotencyMiddleware({ endpoints: ['/'] });

// Public routes
couponRouter.get("/", apiLimiter, getCoupons);
couponRouter.get("/available", apiLimiter, authMiddleware, getAvailableCoupons);
couponRouter.post("/validate", apiLimiter, authMiddleware, couponIdempotency, validateCoupon);

// Admin routes
couponRouter.post("/", apiLimiter, authMiddleware, adminMiddleware, adminCouponIdempotency, createCoupon);
couponRouter.get("/all", apiLimiter, authMiddleware, adminMiddleware, getAllCoupons);
couponRouter.put("/:couponId", apiLimiter, authMiddleware, adminMiddleware, updateCoupon);
couponRouter.delete("/:couponId", apiLimiter, authMiddleware, adminMiddleware, deleteCoupon);

export default couponRouter;

