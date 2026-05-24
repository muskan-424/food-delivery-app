import express from "express";
import {
  getRestaurants,
  getRestaurantsAdmin,
  searchRestaurants,
  getRestaurantKycQueue,
  getRestaurantById,
  getRestaurantByIdAdmin,
  createRestaurant,
  updateRestaurant,
  updateRestaurantKyc,
  createRestaurantKycUploadUrl,
  finalizeRestaurantKycUpload,
  debugDeliveryCoverage,
  deleteRestaurant,
} from "../controllers/restaurantController.js";
import {
  previewPayout,
  createPayoutBatch,
  listPayoutBatches,
  getPayoutBatchById,
  updatePayoutBatchStatus,
  exportPayoutBatchCsv,
  partnerListPayoutBatches,
  partnerGetPayoutBatch,
  partnerExportPayoutCsv,
} from "../controllers/payoutBatchController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { requireRestaurantPermission } from "../middleware/restaurantStaffMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import {
  validateRestaurantDeliveryZones,
  validatePayoutPreviewOrCreate,
  validatePayoutBatchStatusUpdate,
  validatePayoutBatchIdParam,
} from "../middleware/validators.js";

const restaurantRouter = express.Router();

restaurantRouter.post(
  "/payouts/preview",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validatePayoutPreviewOrCreate,
  previewPayout
);
restaurantRouter.post(
  "/payouts/batch",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validatePayoutPreviewOrCreate,
  createPayoutBatch
);
restaurantRouter.get(
  "/payouts/batch",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listPayoutBatches
);
restaurantRouter.get(
  "/payouts/batch/:batchId",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validatePayoutBatchIdParam,
  getPayoutBatchById
);
restaurantRouter.patch(
  "/payouts/batch/:batchId/status",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validatePayoutBatchStatusUpdate,
  updatePayoutBatchStatus
);
restaurantRouter.get(
  "/payouts/batch/:batchId/export.csv",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validatePayoutBatchIdParam,
  exportPayoutBatchCsv
);

/** Partner read-only payouts (must be registered before /:restaurantId so "partner" is not captured) */
restaurantRouter.get(
  "/partner/payouts/batch",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("finance.read"),
  partnerListPayoutBatches
);
restaurantRouter.get(
  "/partner/payouts/batch/:batchId",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("finance.read"),
  validatePayoutBatchIdParam,
  partnerGetPayoutBatch
);
restaurantRouter.get(
  "/partner/payouts/batch/:batchId/export.csv",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("finance.read"),
  validatePayoutBatchIdParam,
  partnerExportPayoutCsv
);

restaurantRouter.get(
  "/admin/list",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getRestaurantsAdmin
);
restaurantRouter.get(
  "/admin/kyc-queue",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getRestaurantKycQueue
);
restaurantRouter.get(
  "/admin/:restaurantId",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getRestaurantByIdAdmin
);
restaurantRouter.get("/search", apiLimiter, searchRestaurants);
restaurantRouter.get("/", apiLimiter, getRestaurants);
restaurantRouter.patch(
  "/:restaurantId/kyc",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  updateRestaurantKyc
);
restaurantRouter.post(
  "/:restaurantId/kyc/upload-url",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("restaurant.manage"),
  createRestaurantKycUploadUrl
);
restaurantRouter.post(
  "/:restaurantId/kyc/finalize",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("restaurant.manage"),
  finalizeRestaurantKycUpload
);
restaurantRouter.get(
  "/:restaurantId/debug-coverage",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  debugDeliveryCoverage
);
restaurantRouter.get("/:restaurantId", apiLimiter, getRestaurantById);
restaurantRouter.post(
  "/",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  validateRestaurantDeliveryZones,
  createRestaurant
);
restaurantRouter.put(
  "/:restaurantId",
  apiLimiter,
  authMiddleware,
  requireRestaurantPermission("restaurant.manage"),
  validateRestaurantDeliveryZones,
  updateRestaurant
);
restaurantRouter.delete("/:restaurantId", apiLimiter, authMiddleware, adminMiddleware, deleteRestaurant);

export default restaurantRouter;

