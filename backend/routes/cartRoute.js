import express from "express";
import {
  addToCart,
  removeFromCart,
  getCart,
} from "../controllers/cartController.js";
import authMiddleware from "../middleware/auth.js";
import { validateCart } from "../middleware/validators.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const cartRouter = express.Router();

// Apply idempotency to cart operations
const cartIdempotency = idempotencyMiddleware({ endpoints: ['/add', '/remove'] });

cartRouter.post("/add", apiLimiter, authMiddleware, validateCart, cartIdempotency, addToCart);
cartRouter.post("/remove", apiLimiter, authMiddleware, validateCart, cartIdempotency, removeFromCart);
cartRouter.post("/get", apiLimiter, authMiddleware, getCart);

export default cartRouter;
