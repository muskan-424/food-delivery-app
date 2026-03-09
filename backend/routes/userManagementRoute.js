import express from "express";
import {
  getAllUsers,
  getUserDetails,
  createUser,
  deleteUser,
  blockUser,
  unblockUser,
  giveWarning,
  removeWarning,
  getAllActivities,
  getDashboardStats
} from "../controllers/userManagementController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const userManagementRouter = express.Router();

// Apply idempotency to user creation
const userCreationIdempotency = idempotencyMiddleware({ endpoints: ['/users'] });

// All routes require admin access
userManagementRouter.get("/users", apiLimiter, authMiddleware, adminMiddleware, getAllUsers);
userManagementRouter.post("/users", apiLimiter, authMiddleware, adminMiddleware, userCreationIdempotency, createUser);
userManagementRouter.get("/user/:userId", apiLimiter, authMiddleware, adminMiddleware, getUserDetails);
userManagementRouter.delete("/user/:userId", apiLimiter, authMiddleware, adminMiddleware, deleteUser);
userManagementRouter.post("/user/:userId/block", apiLimiter, authMiddleware, adminMiddleware, blockUser);
userManagementRouter.post("/user/:userId/unblock", apiLimiter, authMiddleware, adminMiddleware, unblockUser);
userManagementRouter.post("/user/:userId/warning", apiLimiter, authMiddleware, adminMiddleware, giveWarning);
userManagementRouter.post("/user/:userId/remove-warning", apiLimiter, authMiddleware, adminMiddleware, removeWarning);
userManagementRouter.get("/activities", apiLimiter, authMiddleware, adminMiddleware, getAllActivities);
userManagementRouter.get("/dashboard/stats", apiLimiter, authMiddleware, adminMiddleware, getDashboardStats);

export default userManagementRouter;

