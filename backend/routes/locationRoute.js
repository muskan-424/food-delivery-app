import express from "express";
import { validateAddress, calculateDeliveryFee, getNearbyRestaurants } from "../controllers/locationController.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import authMiddleware from "../middleware/auth.js";

const locationRouter = express.Router();

locationRouter.post("/validate", apiLimiter, validateAddress);
locationRouter.post("/delivery-fee", apiLimiter, calculateDeliveryFee);
locationRouter.get("/nearby-restaurants", apiLimiter, getNearbyRestaurants);

export default locationRouter;

