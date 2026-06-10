import express from "express";
import authMiddleware from "../middleware/auth.js";
import { requireRestaurantPermission } from "../middleware/restaurantStaffMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  postOrderRequestDraft,
  getOrderRequestDraftById,
  patchOrderRequestDraft,
  publishOrderRequestDraftHandler,
  listMyOrderRequestDraftsHandler,
  listRestaurantOrderRequestInboxHandler,
} from "../controllers/orderRequestDraftController.js";

const orderRequestRouter = express.Router();

orderRequestRouter.post("/drafts", apiLimiter, authMiddleware, postOrderRequestDraft);
orderRequestRouter.get("/drafts/mine/list", apiLimiter, authMiddleware, listMyOrderRequestDraftsHandler);
orderRequestRouter.get("/drafts/:draftId", apiLimiter, authMiddleware, getOrderRequestDraftById);
orderRequestRouter.patch("/drafts/:draftId", apiLimiter, authMiddleware, patchOrderRequestDraft);
orderRequestRouter.post(
  "/drafts/:draftId/publish",
  apiLimiter,
  authMiddleware,
  publishOrderRequestDraftHandler
);
orderRequestRouter.get(
  "/restaurant/inbox",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("order.manage"),
  listRestaurantOrderRequestInboxHandler
);

export default orderRequestRouter;
