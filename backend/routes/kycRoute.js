import express from "express";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter, authLimiter } from "../middleware/rateLimiter.js";
import {
  getMyKyc,
  submitKyc,
  listPendingKycAdmin,
  reviewUserKycAdmin,
} from "../controllers/kycController.js";

const kycRouter = express.Router();

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

kycRouter.get("/me", apiLimiter, authMiddleware, getMyKyc);

kycRouter.post(
  "/submit",
  authLimiter,
  authMiddleware,
  body("fullName").trim().notEmpty().withMessage("fullName is required"),
  body("pan").trim().notEmpty().withMessage("pan is required"),
  handleValidationErrors,
  submitKyc
);

kycRouter.get("/admin/pending", apiLimiter, authMiddleware, adminMiddleware, listPendingKycAdmin);

kycRouter.patch(
  "/admin/:userId/review",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  body("decision").isIn(["approve", "reject"]).withMessage("decision must be approve or reject"),
  handleValidationErrors,
  reviewUserKycAdmin
);

export default kycRouter;
