import express from "express";
import authMiddleware from "../middleware/auth.js";
import optionalAuthMiddleware from "../middleware/optionalAuthMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  getBetaConfig,
  postBetaFeedback,
  getBetaKpis,
} from "../controllers/betaController.js";

const betaRouter = express.Router();

betaRouter.get("/config", apiLimiter, getBetaConfig);
betaRouter.post("/feedback", apiLimiter, optionalAuthMiddleware, postBetaFeedback);
betaRouter.get("/kpis", apiLimiter, authMiddleware, adminMiddleware, getBetaKpis);

export default betaRouter;
