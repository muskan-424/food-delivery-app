import express from "express";
import { loginUser, registerUser, refreshAccessToken, logoutUser } from "../controllers/userController.js";
import { validateRegister, validateLogin } from "../middleware/validators.js";
import { authLimiter, apiLimiter } from "../middleware/rateLimiter.js";
import authMiddleware from "../middleware/auth.js";

const userRouter = express.Router();

userRouter.post("/register", authLimiter, validateRegister, registerUser);
userRouter.post("/login", authLimiter, validateLogin, loginUser);
userRouter.post("/refresh", apiLimiter, refreshAccessToken);
userRouter.post("/logout", apiLimiter, authMiddleware, logoutUser);

export default userRouter;
