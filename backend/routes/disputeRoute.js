import express from "express";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  createDispute,
  listMyDisputes,
  adminListDisputes,
  adminDisputeSummary,
  getDispute,
  adminUpdateDispute,
  addCustomerDisputeReply,
} from "../controllers/disputeController.js";
import { disputeCreateVelocityGuard } from "../middleware/velocityGuard.js";

const disputeRouter = express.Router();

disputeRouter.post("/", apiLimiter, authMiddleware, disputeCreateVelocityGuard, createDispute);
disputeRouter.get("/mine", apiLimiter, authMiddleware, listMyDisputes);
disputeRouter.get("/admin/all", apiLimiter, authMiddleware, adminMiddleware, adminListDisputes);
disputeRouter.get(
  "/admin/summary",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  adminDisputeSummary
);
disputeRouter.patch(
  "/admin/:disputeId",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  adminUpdateDispute
);
disputeRouter.post("/:disputeId/reply", apiLimiter, authMiddleware, addCustomerDisputeReply);
disputeRouter.get("/:disputeId", apiLimiter, authMiddleware, getDispute);

export default disputeRouter;
