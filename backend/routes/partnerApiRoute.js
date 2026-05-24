import express from "express";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  issuePartnerAccessToken,
  getPartnerMe,
  partnerOrdersPing,
  getPartnerScopeCatalog,
} from "../controllers/partnerApiController.js";
import { partnerClientAuth, requirePartnerScope } from "../middleware/partnerClientAuth.js";
import { partnerApiAuditMiddleware } from "../middleware/partnerApiAuditMiddleware.js";

const partnerApiRouter = express.Router();
partnerApiRouter.use(partnerApiAuditMiddleware);

partnerApiRouter.post("/oauth/token", apiLimiter, issuePartnerAccessToken);
partnerApiRouter.get("/scopes", apiLimiter, getPartnerScopeCatalog);
partnerApiRouter.get("/me", apiLimiter, partnerClientAuth, getPartnerMe);
partnerApiRouter.get(
  "/orders/ping",
  apiLimiter,
  partnerClientAuth,
  requirePartnerScope("orders.read"),
  partnerOrdersPing
);

export default partnerApiRouter;
