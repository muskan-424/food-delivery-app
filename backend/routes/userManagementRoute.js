import express from "express";
import {
  getAllUsers,
  getHighRiskUsers,
  bulkBlockUsers,
  bulkUnblockUsers,
  bulkWarnUsers,
  bulkUserAction,
  getUserDetails,
  createUser,
  deleteUser,
  blockUser,
  unblockUser,
  giveWarning,
  removeWarning,
  getAllActivities,
  getFraudSummary,
  getDashboardStats,
  updateUserSegmentTags,
  getSegmentTagCatalog,
  previewSegmentAudience,
  createCampaign,
  listCampaigns,
  previewCampaignAudience,
  runCampaignDry,
  getDynamicPricingAdmin,
  setDynamicPricingAdminOverride,
  clearDynamicPricingAdminOverride,
  setDynamicPricingAdminRules,
  listDynamicPricingAudit,
  listAnalyticsEvents,
  createAnalyticsExport,
  listAnalyticsExports,
  downloadAnalyticsExport,
  createAbExperiment,
  listAbExperiments,
  updateAbExperimentStatus,
  getAbExperimentResults,
  previewAbExperimentAssignmentForUser,
  createPartnerApiClient,
  listPartnerApiClients,
  updatePartnerApiClientStatus,
  rotatePartnerApiClientSecret,
  listPartnerApiAudit,
  exportPartnerApiAuditCsv,
  updateUserRestaurantStaff,
  clearUserRestaurantStaff,
  getRestaurantStaffPermissionCatalog,
} from "../controllers/userManagementController.js";
import { getAdminAuditLogs } from "../controllers/auditLogController.js";
import { getKycMetricsAdmin } from "../controllers/kycController.js";
import {
  getEscrowMetricsAdmin,
  getPaymentOpsMetricsAdmin,
} from "../controllers/opsMetricsController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const userManagementRouter = express.Router();

// Apply idempotency to user creation
const userCreationIdempotency = idempotencyMiddleware({ endpoints: ['/users'] });

// All routes require admin access
userManagementRouter.get("/users", apiLimiter, authMiddleware, adminMiddleware, getAllUsers);
userManagementRouter.get(
  "/users/restaurant-staff/permissions",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getRestaurantStaffPermissionCatalog
);
userManagementRouter.get("/users/high-risk", apiLimiter, authMiddleware, adminMiddleware, getHighRiskUsers);
userManagementRouter.post("/users/bulk/block", apiLimiter, authMiddleware, adminMiddleware, bulkBlockUsers);
userManagementRouter.post("/users/bulk/unblock", apiLimiter, authMiddleware, adminMiddleware, bulkUnblockUsers);
userManagementRouter.post("/users/bulk/warn", apiLimiter, authMiddleware, adminMiddleware, bulkWarnUsers);
userManagementRouter.post("/users/bulk/action", apiLimiter, authMiddleware, adminMiddleware, bulkUserAction);
userManagementRouter.post("/users", apiLimiter, authMiddleware, adminMiddleware, userCreationIdempotency, createUser);
userManagementRouter.get("/user/:userId", apiLimiter, authMiddleware, adminMiddleware, getUserDetails);
userManagementRouter.delete("/user/:userId", apiLimiter, authMiddleware, adminMiddleware, deleteUser);
userManagementRouter.post("/user/:userId/block", apiLimiter, authMiddleware, adminMiddleware, blockUser);
userManagementRouter.post("/user/:userId/unblock", apiLimiter, authMiddleware, adminMiddleware, unblockUser);
userManagementRouter.post("/user/:userId/warning", apiLimiter, authMiddleware, adminMiddleware, giveWarning);
userManagementRouter.post("/user/:userId/remove-warning", apiLimiter, authMiddleware, adminMiddleware, removeWarning);
userManagementRouter.get("/activities", apiLimiter, authMiddleware, adminMiddleware, getAllActivities);
userManagementRouter.get("/audit-logs", apiLimiter, authMiddleware, adminMiddleware, getAdminAuditLogs);
userManagementRouter.get("/metrics/kyc", apiLimiter, authMiddleware, adminMiddleware, getKycMetricsAdmin);
userManagementRouter.get(
  "/metrics/escrow",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getEscrowMetricsAdmin
);
userManagementRouter.get(
  "/metrics/payments",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getPaymentOpsMetricsAdmin
);
userManagementRouter.get("/fraud/summary", apiLimiter, authMiddleware, adminMiddleware, getFraudSummary);
userManagementRouter.get("/dashboard/stats", apiLimiter, authMiddleware, adminMiddleware, getDashboardStats);
userManagementRouter.get("/segments/catalog", apiLimiter, authMiddleware, adminMiddleware, getSegmentTagCatalog);
userManagementRouter.get(
  "/segments/audience-preview",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  previewSegmentAudience
);
userManagementRouter.post(
  "/segments/audience-preview",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  previewSegmentAudience
);
userManagementRouter.post("/campaigns", apiLimiter, authMiddleware, adminMiddleware, createCampaign);
userManagementRouter.get("/campaigns", apiLimiter, authMiddleware, adminMiddleware, listCampaigns);
userManagementRouter.post(
  "/campaigns/:campaignId/preview",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  previewCampaignAudience
);
userManagementRouter.post(
  "/campaigns/:campaignId/run-dry",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  runCampaignDry
);
userManagementRouter.get(
  "/pricing/dynamic",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getDynamicPricingAdmin
);
userManagementRouter.put(
  "/pricing/dynamic/override",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  setDynamicPricingAdminOverride
);
userManagementRouter.delete(
  "/pricing/dynamic/override",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  clearDynamicPricingAdminOverride
);
userManagementRouter.put(
  "/pricing/dynamic/rules",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  setDynamicPricingAdminRules
);
userManagementRouter.get(
  "/pricing/dynamic/audit",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listDynamicPricingAudit
);
userManagementRouter.get(
  "/analytics/events",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listAnalyticsEvents
);
userManagementRouter.post(
  "/analytics/events/export",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  createAnalyticsExport
);
userManagementRouter.get(
  "/analytics/events/exports",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listAnalyticsExports
);
userManagementRouter.get(
  "/analytics/events/exports/:exportId/download",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  downloadAnalyticsExport
);
userManagementRouter.post(
  "/experiments",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  createAbExperiment
);
userManagementRouter.get(
  "/experiments",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listAbExperiments
);
userManagementRouter.patch(
  "/experiments/:experimentKey/status",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  updateAbExperimentStatus
);
userManagementRouter.get(
  "/experiments/:experimentKey/results",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  getAbExperimentResults
);
userManagementRouter.get(
  "/experiments/:experimentKey/preview-assignment",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  previewAbExperimentAssignmentForUser
);
userManagementRouter.post(
  "/partner-clients",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  createPartnerApiClient
);
userManagementRouter.get(
  "/partner-clients",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listPartnerApiClients
);
userManagementRouter.patch(
  "/partner-clients/:clientId/status",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  updatePartnerApiClientStatus
);
userManagementRouter.post(
  "/partner-clients/:clientId/rotate-secret",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  rotatePartnerApiClientSecret
);
userManagementRouter.get(
  "/partner-api/audit",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  listPartnerApiAudit
);
userManagementRouter.get(
  "/partner-api/audit.csv",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  exportPartnerApiAuditCsv
);
userManagementRouter.patch("/user/:userId/segments", apiLimiter, authMiddleware, adminMiddleware, updateUserSegmentTags);
userManagementRouter.patch(
  "/user/:userId/restaurant-staff",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  updateUserRestaurantStaff
);
userManagementRouter.delete(
  "/user/:userId/restaurant-staff",
  apiLimiter,
  authMiddleware,
  adminMiddleware,
  clearUserRestaurantStaff
);

export default userManagementRouter;

