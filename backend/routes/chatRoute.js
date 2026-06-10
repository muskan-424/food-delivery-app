import express from "express";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  postAgentChat,
  postClassifyChat,
  getAgentChatHistory,
} from "../controllers/agentChatController.js";

const chatRouter = express.Router();

chatRouter.post("/agent", apiLimiter, authMiddleware, postAgentChat);
chatRouter.post("/classify", apiLimiter, authMiddleware, postClassifyChat);
chatRouter.get("/history/:sessionId", apiLimiter, authMiddleware, getAgentChatHistory);

export default chatRouter;
