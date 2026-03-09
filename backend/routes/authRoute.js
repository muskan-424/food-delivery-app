import express from "express";
import { 
  requestPasswordReset, 
  resetPassword, 
  generateCSRFToken,
  setup2FA,
  verify2FA,
  disable2FA,
  createAdmin,
  getAdminInfo
} from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter, authLimiter } from "../middleware/rateLimiter.js";
import { body, validationResult } from "express-validator";

const authRouter = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array()
    });
  }
  next();
};

// Password reset routes
authRouter.post("/password-reset/request", 
  authLimiter,
  body("email").isEmail().normalizeEmail(),
  handleValidationErrors,
  requestPasswordReset
);

authRouter.post("/password-reset/reset",
  authLimiter,
  body("token").notEmpty().withMessage("Token is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage("Password must contain at least one special character"),
  handleValidationErrors,
  resetPassword
);

// CSRF token generation
authRouter.get("/csrf-token", 
  apiLimiter,
  authMiddleware,
  generateCSRFToken
);

// 2FA routes
authRouter.post("/2fa/setup",
  apiLimiter,
  authMiddleware,
  setup2FA
);

authRouter.post("/2fa/verify",
  apiLimiter,
  authMiddleware,
  body("code").notEmpty().withMessage("Verification code is required"),
  handleValidationErrors,
  verify2FA
);

authRouter.post("/2fa/disable",
  apiLimiter,
  authMiddleware,
  body("password").notEmpty().withMessage("Password is required"),
  handleValidationErrors,
  disable2FA
);

// Admin management routes (admin only)
authRouter.post("/admin/create",
  authLimiter, // More restrictive rate limiting for admin creation
  authMiddleware,
  adminMiddleware,
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage("Password must contain at least one special character"),
  handleValidationErrors,
  createAdmin
);

authRouter.get("/admin/info",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getAdminInfo
);

export default authRouter;

