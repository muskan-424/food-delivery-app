import express from "express";
import {
  exportUserDataRequest,
  downloadExport,
  requestDataDeletion,
  anonymizeUserData,
  deleteUserDataCompletely,
  getRetentionPolicyInfo,
  getRetentionLastRunInfo,
  runRetentionNow,
} from "../controllers/gdprController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import bcrypt from "bcrypt";

const gdprRouter = express.Router();

// User routes (GDPR rights)
gdprRouter.get("/export", apiLimiter, authMiddleware, exportUserDataRequest);
gdprRouter.get("/download/:filename", apiLimiter, authMiddleware, downloadExport);
gdprRouter.post("/delete-request", apiLimiter, authMiddleware, requestDataDeletion);
gdprRouter.post("/anonymize", apiLimiter, authMiddleware, anonymizeUserData); // Anonymize own data

// Admin routes
gdprRouter.post("/anonymize/:userId", apiLimiter, authMiddleware, adminMiddleware, anonymizeUserData);
gdprRouter.delete("/delete/:userId", apiLimiter, authMiddleware, adminMiddleware, deleteUserDataCompletely);
gdprRouter.get("/admin/retention/policies", apiLimiter, authMiddleware, adminMiddleware, getRetentionPolicyInfo);
gdprRouter.get("/admin/retention/last-run", apiLimiter, authMiddleware, adminMiddleware, getRetentionLastRunInfo);
gdprRouter.post("/admin/retention/run", apiLimiter, authMiddleware, adminMiddleware, runRetentionNow);

export default gdprRouter;

