import express from "express";
import {
  loginUser,
  registerUser,
  refreshAccessToken,
  logoutUser,
  getGrowthSummary,
  previewLoyalty,
  getExperimentAssignment,
} from "../controllers/userController.js";
import { validateRegister, validateLogin } from "../middleware/validators.js";
import { authLimiter, apiLimiter } from "../middleware/rateLimiter.js";
import authMiddleware from "../middleware/auth.js";
import { registerVelocityGuard } from "../middleware/velocityGuard.js";

const userRouter = express.Router();

userRouter.post("/register", authLimiter, registerVelocityGuard, validateRegister, registerUser);
userRouter.post("/login", authLimiter, validateLogin, loginUser);
userRouter.post("/refresh", apiLimiter, refreshAccessToken);
userRouter.post("/logout", apiLimiter, authMiddleware, logoutUser);
userRouter.get("/growth", apiLimiter, authMiddleware, getGrowthSummary);
userRouter.get("/loyalty/preview", apiLimiter, authMiddleware, previewLoyalty);
userRouter.get("/experiments/:experimentKey/assignment", apiLimiter, authMiddleware, getExperimentAssignment);

export default userRouter;
