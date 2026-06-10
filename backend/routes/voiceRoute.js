import express from "express";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  postVoiceTranscribe,
  voiceUploadMiddleware,
} from "../controllers/voiceController.js";

const voiceRouter = express.Router();

voiceRouter.post(
  "/transcribe",
  apiLimiter,
  authMiddleware,
  voiceUploadMiddleware,
  postVoiceTranscribe
);

export default voiceRouter;
