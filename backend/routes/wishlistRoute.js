import express from "express";
import { getWishlist, addToWishlist, removeFromWishlist, checkWishlist } from "../controllers/wishlistController.js";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const wishlistRouter = express.Router();

// Apply idempotency to wishlist operations
const wishlistIdempotency = idempotencyMiddleware({ endpoints: ['/'] });

wishlistRouter.get("/", apiLimiter, authMiddleware, getWishlist);
wishlistRouter.post("/", apiLimiter, authMiddleware, wishlistIdempotency, addToWishlist);
wishlistRouter.delete("/:foodId", apiLimiter, authMiddleware, removeFromWishlist);
wishlistRouter.get("/check/:foodId", apiLimiter, authMiddleware, checkWishlist);

export default wishlistRouter;

