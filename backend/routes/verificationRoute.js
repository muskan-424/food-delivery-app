import express from "express";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middleware/auth.js";
import { authLimiter, apiLimiter } from "../middleware/rateLimiter.js";
import {
  getVerificationStatus,
  requestEmailOtp,
  verifyEmailOtpHandler,
  registerTrustedDevice,
} from "../controllers/verificationController.js";

const verificationRouter = express.Router();

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

verificationRouter.get("/me", apiLimiter, authMiddleware, getVerificationStatus);

verificationRouter.post(
  "/email/request-otp",
  authLimiter,
  authMiddleware,
  body("purpose")
    .optional()
    .isIn(["EMAIL_VERIFICATION", "SENSITIVE_ACTION"])
    .withMessage("Invalid purpose"),
  handleValidationErrors,
  requestEmailOtp
);

verificationRouter.post(
  "/email/verify",
  authLimiter,
  authMiddleware,
  body("code").notEmpty().withMessage("code is required"),
  body("purpose")
    .optional()
    .isIn(["EMAIL_VERIFICATION", "SENSITIVE_ACTION"])
    .withMessage("Invalid purpose"),
  handleValidationErrors,
  verifyEmailOtpHandler
);

verificationRouter.post(
  "/devices/register",
  apiLimiter,
  authMiddleware,
  body("fingerprint")
    .trim()
    .isLength({ min: 8, max: 128 })
    .withMessage("fingerprint must be 8–128 characters"),
  handleValidationErrors,
  registerTrustedDevice
);

export default verificationRouter;
