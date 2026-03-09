import express from "express";
import { 
  createDeliveryPerson, 
  assignDelivery, 
  updateDeliveryLocation, 
  getMyDeliveries,
  acceptDelivery,
  markPickedUp,
  markDelivered
} from "../controllers/deliveryController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const deliveryRouter = express.Router();

// Admin routes
deliveryRouter.post("/person", apiLimiter, authMiddleware, adminMiddleware, createDeliveryPerson);
deliveryRouter.post("/assign", apiLimiter, authMiddleware, adminMiddleware, assignDelivery);

// Delivery person routes
deliveryRouter.get("/my-deliveries", apiLimiter, authMiddleware, getMyDeliveries);
deliveryRouter.put("/assignment/:assignmentId/accept", apiLimiter, authMiddleware, acceptDelivery);
deliveryRouter.put("/assignment/:assignmentId/picked-up", apiLimiter, authMiddleware, markPickedUp);
deliveryRouter.put("/assignment/:assignmentId/delivered", apiLimiter, authMiddleware, markDelivered);
deliveryRouter.put("/order/:orderId/location", apiLimiter, authMiddleware, updateDeliveryLocation);

export default deliveryRouter;

