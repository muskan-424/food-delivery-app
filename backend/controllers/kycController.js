import { appConfig } from "../config/appConfig.js";
import {
  getKycProfileForUser,
  submitUserKyc,
  adminReviewUserKyc,
  listPendingKyc,
  getKycMetricsSummary,
} from "../services/kycService.js";
import { serializeKycProfile } from "../utils/userKycUtils.js";
import { writeAudit } from "../services/auditService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { buildPaginationMeta } from "../utils/pagination.js";

export const getMyKyc = async (req, res) => {
  try {
    const userId = req.body.userId;
    const profile = await getKycProfileForUser(userId);
    return sendSuccess(res, req, 200, {
      success: true,
      data: serializeKycProfile(profile),
    });
  } catch (error) {
    console.error("getMyKyc:", error);
    return sendError(res, req, 500, "Error loading KYC status");
  }
};

export const submitKyc = async (req, res) => {
  try {
    if (!appConfig.enableUserKyc) {
      return sendError(res, req, 503, "User KYC is disabled");
    }

    const userId = req.body.userId;
    const { fullName, pan, aadhaarLast4 } = req.body;
    if (!fullName || !pan) {
      return sendError(res, req, 400, "fullName and pan are required");
    }

    let profile;
    try {
      profile = await submitUserKyc({ userId, fullName, pan, aadhaarLast4 });
    } catch (e) {
      if (e.message === "already_verified") {
        return sendError(res, req, 409, "KYC already verified");
      }
      if (e.message === "invalid_pan") {
        return sendError(res, req, 400, "Invalid PAN format");
      }
      throw e;
    }

    await writeAudit(req, {
      userId,
      action: "kyc.submit",
      resourceType: "userKycProfile",
      resourceId: String(profile._id),
      meta: { status: profile.status, provider: profile.provider },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "KYC submitted",
      data: serializeKycProfile(profile),
    });
  } catch (error) {
    console.error("submitKyc:", error);
    return sendError(res, req, 500, "Error submitting KYC");
  }
};

export const listPendingKycAdmin = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await listPendingKyc({ page, limit });
    return sendSuccess(res, req, 200, {
      success: true,
      data: result.rows,
      pagination: buildPaginationMeta(result.total, result.page, result.limit),
    });
  } catch (error) {
    console.error("listPendingKycAdmin:", error);
    return sendError(res, req, 500, "Error loading pending KYC queue");
  }
};

export const reviewUserKycAdmin = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const decision = String(req.body.decision || "").trim().toLowerCase();
    const reason = req.body.reason;

    if (!["approve", "reject"].includes(decision)) {
      return sendError(res, req, 400, "decision must be approve or reject");
    }
    if (decision === "reject" && !String(reason || "").trim()) {
      return sendError(res, req, 400, "reason is required for rejection");
    }

    let profile;
    try {
      profile = await adminReviewUserKyc({
        userId: targetUserId,
        approve: decision === "approve",
        reason,
        actorId: req.body.userId,
      });
    } catch (e) {
      if (e.message === "not_found") return sendError(res, req, 404, "No KYC profile for user");
      if (e.message === "not_pending") return sendError(res, req, 409, "KYC is not pending review");
      throw e;
    }

    await writeAudit(req, {
      userId: req.body.userId,
      action: "kyc.admin_review",
      resourceType: "userKycProfile",
      resourceId: String(profile._id),
      meta: { subjectUserId: targetUserId, decision },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: `KYC ${decision === "approve" ? "approved" : "rejected"}`,
      data: serializeKycProfile(profile),
    });
  } catch (error) {
    console.error("reviewUserKycAdmin:", error);
    return sendError(res, req, 500, "Error reviewing KYC");
  }
};

export const getKycMetricsAdmin = async (req, res) => {
  try {
    const summary = await getKycMetricsSummary();
    return sendSuccess(res, req, 200, { success: true, data: summary });
  } catch (error) {
    console.error("getKycMetricsAdmin:", error);
    return sendError(res, req, 500, "Error loading KYC metrics");
  }
};
