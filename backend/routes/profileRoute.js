import express from "express";
import { getProfile, updateProfile, uploadProfilePicture, deleteProfilePicture, changePassword, deleteAccount } from "../controllers/profileController.js";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";
import multer from "multer";
import path from "path";

const profileRouter = express.Router();

// Apply idempotency to profile picture upload
const profilePictureIdempotency = idempotencyMiddleware({ endpoints: ['/picture'] });

// Multer configuration for profile picture
const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    const sanitizedName = path.basename(file.originalname);
    const uniqueName = `profile_${Date.now()}_${sanitizedName}`;
    return cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

profileRouter.get("/", apiLimiter, authMiddleware, getProfile);
profileRouter.put("/", apiLimiter, authMiddleware, updateProfile);
profileRouter.post("/picture", apiLimiter, authMiddleware, upload.single("profilePicture"), profilePictureIdempotency, uploadProfilePicture);
profileRouter.delete("/picture", apiLimiter, authMiddleware, deleteProfilePicture);
profileRouter.put("/password", apiLimiter, authMiddleware, changePassword);
profileRouter.delete("/account", apiLimiter, authMiddleware, deleteAccount);

export default profileRouter;

