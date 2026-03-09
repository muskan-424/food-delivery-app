import express from "express";
import { addReview, getFoodReviews, getOrderReviews, updateReview, deleteReview, getAllReviews, updateReviewStatus, adminDeleteReview } from "../controllers/reviewController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const reviewRouter = express.Router();

// Apply idempotency to review creation
const reviewIdempotency = idempotencyMiddleware({ endpoints: ['/'] });

// User routes
reviewRouter.post("/", apiLimiter, authMiddleware, reviewIdempotency, addReview);
reviewRouter.get("/food/:foodId", apiLimiter, getFoodReviews);
reviewRouter.get("/order/:orderId", apiLimiter, authMiddleware, getOrderReviews);
reviewRouter.put("/:reviewId", apiLimiter, authMiddleware, updateReview);
reviewRouter.delete("/:reviewId", apiLimiter, authMiddleware, deleteReview);

// Admin routes
reviewRouter.get("/admin/all", apiLimiter, authMiddleware, adminMiddleware, getAllReviews);
reviewRouter.put("/admin/:reviewId/status", apiLimiter, authMiddleware, adminMiddleware, updateReviewStatus);
reviewRouter.delete("/admin/:reviewId", apiLimiter, authMiddleware, adminMiddleware, adminDeleteReview);

export default reviewRouter;

