import express from "express";
import { addFood, listFood, getFoodById, updateFood, removeFood } from "../controllers/foodController.js";
import multer from "multer";
import path from "path";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { validateFood, validateRemoveFood } from "../middleware/validators.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const foodRouter = express.Router();

// Secure Image Storage Engine with validation
const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    // Sanitize filename to prevent path traversal
    const sanitizedName = path.basename(file.originalname);
    const uniqueName = `${Date.now()}_${sanitizedName}`;
    return cb(null, uniqueName);
  }
});

// File filter for image types only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Apply idempotency to food add endpoint
const foodIdempotency = idempotencyMiddleware({ endpoints: ['/add'] });

// Routes with rate limiting, validation, and proper middleware order
foodRouter.post("/add", 
  apiLimiter,
  upload.single("image"),
  authMiddleware,
  adminMiddleware, // Check admin BEFORE processing file
  validateFood,
  foodIdempotency,
  addFood
);

foodRouter.get("/list", apiLimiter, listFood);
foodRouter.get("/:foodId", apiLimiter, getFoodById);

foodRouter.put("/:foodId",
  apiLimiter,
  upload.single("image"),
  authMiddleware,
  adminMiddleware,
  updateFood
);

foodRouter.post("/remove", 
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validateRemoveFood,
  removeFood
);

export default foodRouter;
