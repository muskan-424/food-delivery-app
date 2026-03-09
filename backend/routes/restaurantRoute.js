import express from "express";
import { getRestaurants, getRestaurantById, createRestaurant, updateRestaurant, deleteRestaurant } from "../controllers/restaurantController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const restaurantRouter = express.Router();

restaurantRouter.get("/", apiLimiter, getRestaurants);
restaurantRouter.get("/:restaurantId", apiLimiter, getRestaurantById);
restaurantRouter.post("/", apiLimiter, authMiddleware, adminMiddleware, createRestaurant);
restaurantRouter.put("/:restaurantId", apiLimiter, authMiddleware, adminMiddleware, updateRestaurant);
restaurantRouter.delete("/:restaurantId", apiLimiter, authMiddleware, adminMiddleware, deleteRestaurant);

export default restaurantRouter;

