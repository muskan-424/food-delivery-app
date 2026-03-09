import express from "express";
import {
  exportUserDataRequest,
  downloadExport,
  requestDataDeletion,
  anonymizeUserData,
  deleteUserDataCompletely
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

export default gdprRouter;

