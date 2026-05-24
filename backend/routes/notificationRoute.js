import express from "express";
import {
  getInbox,
  patchRead,
  postReadAll,
  streamSse,
} from "../controllers/notificationController.js";
import authMiddleware from "../middleware/auth.js";
import sseAuthMiddleware from "../middleware/sseAuthMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const notificationRouter = express.Router();

notificationRouter.get("/stream", apiLimiter, sseAuthMiddleware, streamSse);
notificationRouter.get("/inbox", apiLimiter, authMiddleware, getInbox);
notificationRouter.patch("/:notificationId/read", apiLimiter, authMiddleware, patchRead);
notificationRouter.post("/read-all", apiLimiter, authMiddleware, postReadAll);

export default notificationRouter;
