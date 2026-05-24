import express from "express";
import { 
  createDeliveryPerson, 
  assignDelivery, 
  groupAssignmentsIntoBatch,
  resequenceBatchAssignments,
  ungroupBatchAssignments,
  getBatchDetails,
  optimizeBatchRoute,
  createPodEvidenceUploadUrl,
  finalizePodEvidenceUpload,
  updateDeliveryLocation, 
  getMyDeliveries,
  acceptDelivery,
  markPickedUp,
  markDelivered,
  rejectAssignment,
} from "../controllers/deliveryController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const deliveryRouter = express.Router();

// Admin routes
deliveryRouter.post("/person", apiLimiter, authMiddleware, adminMiddleware, createDeliveryPerson);
deliveryRouter.post("/assign", apiLimiter, authMiddleware, adminMiddleware, assignDelivery);
deliveryRouter.post("/batch/group", apiLimiter, authMiddleware, adminMiddleware, groupAssignmentsIntoBatch);
deliveryRouter.put(
  "/batch/:batchId/resequence",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  resequenceBatchAssignments
);
deliveryRouter.get("/batch/:batchId", apiLimiter, authMiddleware, adminMiddleware, getBatchDetails);
deliveryRouter.post(
  "/batch/:batchId/optimize-route",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  optimizeBatchRoute
);
deliveryRouter.delete(
  "/batch/:batchId",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  ungroupBatchAssignments
);

// Delivery person routes
deliveryRouter.get("/my-deliveries", apiLimiter, authMiddleware, getMyDeliveries);
deliveryRouter.put("/assignment/:assignmentId/accept", apiLimiter, authMiddleware, acceptDelivery);
deliveryRouter.put("/assignment/:assignmentId/picked-up", apiLimiter, authMiddleware, markPickedUp);
deliveryRouter.put("/assignment/:assignmentId/reject", apiLimiter, authMiddleware, rejectAssignment);
deliveryRouter.post(
  "/assignment/:assignmentId/pod/upload-url",
  apiLimiter,
  authMiddleware,
  createPodEvidenceUploadUrl
);
deliveryRouter.post(
  "/assignment/:assignmentId/pod/finalize",
  apiLimiter,
  authMiddleware,
  finalizePodEvidenceUpload
);
deliveryRouter.put("/assignment/:assignmentId/delivered", apiLimiter, authMiddleware, markDelivered);
deliveryRouter.put("/order/:orderId/location", apiLimiter, authMiddleware, updateDeliveryLocation);

export default deliveryRouter;

