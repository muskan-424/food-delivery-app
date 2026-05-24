import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import "dotenv/config";
import { connectDB } from "./config/db.js";
import { appConfig } from "./config/appConfig.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { sendError } from "./utils/apiResponse.js";
import { startJobQueue } from "./jobs/queue.js";
import foodRouter from "./routes/foodRoute.js";
import userRouter from "./routes/userRoute.js";
import cartRouter from "./routes/cartRoute.js";
import orderRouter from "./routes/orderRoute.js";
import profileRouter from "./routes/profileRoute.js";
import addressRouter from "./routes/addressRoute.js";
import reviewRouter from "./routes/reviewRoute.js";
import wishlistRouter from "./routes/wishlistRoute.js";
import couponRouter from "./routes/couponRoute.js";
import orderTrackingRouter from "./routes/orderTrackingRoute.js";
import deliveryRouter from "./routes/deliveryRoute.js";
import locationRouter from "./routes/locationRoute.js";
import restaurantRouter from "./routes/restaurantRoute.js";
import supportRouter from "./routes/supportRoute.js";
import paymentRouter from "./routes/paymentRoute.js";
import paymentWebhookRouter from "./routes/paymentWebhookRoute.js";
import offerRouter from "./routes/offerRoute.js";
import searchRouter from "./routes/searchRoute.js";
import userManagementRouter from "./routes/userManagementRoute.js";
import authRouter from "./routes/authRoute.js";
import gdprRouter from "./routes/gdprRoute.js";
import activityLogger from "./middleware/activityLogger.js";
import csrfMiddleware from "./middleware/csrfMiddleware.js";
import httpsEnforcement from "./middleware/httpsEnforcement.js";
import dataMaskingMiddleware from "./middleware/dataMaskingMiddleware.js";
import healthRouter from "./routes/healthRoute.js";
import notificationRouter from "./routes/notificationRoute.js";
import disputeRouter from "./routes/disputeRoute.js";
import partnerApiRouter from "./routes/partnerApiRoute.js";
import { initWebsocketServer } from "./realtime/wsHub.js";

// app config
const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 4000;

app.use(requestIdMiddleware);

// Body parsing (rawBody used for payment webhook HMAC verification)
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTPS enforcement (in production)
if (process.env.NODE_ENV === 'production') {
  app.use(httpsEnforcement);
}

// CORS configuration
app.use(cors());

// Static file serving for images (must be before helmet to avoid blocking)
app.use("/images", express.static("uploads", {
  setHeaders: (res, path) => {
    // Set proper content type for images
    if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (path.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
    // Allow CORS for images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
  }
}));

// Security middleware (after static files to avoid blocking images)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow images to be loaded
  contentSecurityPolicy: false // Disable CSP for images (or configure properly)
}));

// Health check (used by Docker / load balancers; keep before heavy middleware)
app.use("/api/health", healthRouter);

// Activity logging middleware (after body parsing, before routes)
app.use(activityLogger);

// CSRF protection for state-changing operations
// Apply to routes that modify data (POST, PUT, DELETE, PATCH)
app.use("/api/cart", csrfMiddleware);
app.use("/api/order", csrfMiddleware);
app.use("/api/profile", csrfMiddleware);
app.use("/api/address", csrfMiddleware);
app.use("/api/review", csrfMiddleware);
app.use("/api/wishlist", csrfMiddleware);
app.use("/api/payment", csrfMiddleware);
app.use("/api/admin/users", csrfMiddleware);
app.use("/api/gdpr", csrfMiddleware);
app.use("/api/notifications", csrfMiddleware);
app.use("/api/disputes", csrfMiddleware);

// DB connection
connectDB();

const queueRuntime = startJobQueue();

// Initialize scheduled jobs on queue (data retention, loyalty expiry)
if (appConfig.enableScheduledJobs) {
  import("./utils/scheduledJobs.js")
    .then((module) => module.initializeScheduledJobs(queueRuntime?.queue || null))
    .catch((err) => {
      console.error("Error initializing scheduled jobs:", err);
    });
}

// Root endpoint
app.get("/", (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: "API Working" 
  });
});


// api endpoints
app.use("/api/food", foodRouter);
app.use("/api/user", userRouter);
app.use("/api/cart", cartRouter);
app.use("/api/order", orderRouter);
app.use("/api/profile", profileRouter);
app.use("/api/address", addressRouter);
app.use("/api/review", reviewRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/coupon", couponRouter);
app.use("/api/tracking", orderTrackingRouter);
app.use("/api/delivery", deliveryRouter);
app.use("/api/location", locationRouter);
app.use("/api/restaurant", restaurantRouter);
app.use("/api/support", supportRouter);
app.use("/api/payment/webhook", paymentWebhookRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/offer", offerRouter);
app.use("/api/search", searchRouter);
// Mask responses for admin user-management API (must run before the router on the same path)
app.use("/api/admin/users", dataMaskingMiddleware({ maskForAdmin: true, maskForList: true }));
app.use("/api/admin/users", userManagementRouter);
app.use("/api/auth", authRouter);
app.use("/api/gdpr", gdprRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/disputes", disputeRouter);
app.use("/api/partner", partnerApiRouter);

// Error handling middleware for multer file upload errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, req, 400, "File too large. Maximum size is 5MB.");
    }
    return sendError(res, req, 400, error.message);
  }
  if (error.message === "Only image files are allowed (jpeg, jpg, png, gif, webp)") {
    return sendError(res, req, 400, error.message);
  }
  next(error);
});

// 404 handler (must be after all routes)
app.use((req, res) => {
  sendError(res, req, 404, "Route not found");
});

// Global error handler (must be last)
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  const extra =
    process.env.NODE_ENV === "development"
      ? { detail: error.message }
      : {};
  sendError(res, req, 500, "Internal server error", extra);
});

initWebsocketServer(httpServer).catch((err) => {
  console.error("WebSocket init error:", err?.message || err);
});

httpServer.listen(port, () => {
  console.log(`Server Started on port: ${port}`);
});
