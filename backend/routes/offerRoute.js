import express from "express";
import {
  getActiveOffers,
  calculateDiscounts,
  getAllOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOfferStatus
} from "../controllers/offerController.js";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const offerRouter = express.Router();

// User routes
offerRouter.get("/active", apiLimiter, authMiddleware, getActiveOffers);
offerRouter.post("/calculate", apiLimiter, authMiddleware, calculateDiscounts);

// Admin routes
offerRouter.get("/admin/all", apiLimiter, authMiddleware, getAllOffers);
offerRouter.post("/admin/create", apiLimiter, authMiddleware, createOffer);
offerRouter.put("/admin/:offerId", apiLimiter, authMiddleware, updateOffer);
offerRouter.delete("/admin/:offerId", apiLimiter, authMiddleware, deleteOffer);
offerRouter.put("/admin/:offerId/toggle", apiLimiter, authMiddleware, toggleOfferStatus);

export default offerRouter;

