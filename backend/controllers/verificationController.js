import userModel from "../models/userModel.js";
import userTrustedDeviceModel from "../models/userTrustedDeviceModel.js";
import { appConfig } from "../config/appConfig.js";
import { createAndSendEmailOtp, verifyEmailOtp } from "../services/otpService.js";
import { writeAudit } from "../services/auditService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const getVerificationStatus = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const user = await userModel.findById(userId).select("email emailVerifiedAt");
    if (!user) return sendError(res, req, 404, "User not found");

    const devices = await userTrustedDeviceModel
      .find({ userId })
      .sort({ lastSeenAt: -1 })
      .limit(20)
      .lean();

    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        emailVerifiedAt: user.emailVerifiedAt || null,
        trustedDevices: devices.map((d) => ({
          fingerprint: d.fingerprint,
          label: d.label,
          lastSeenAt: d.lastSeenAt,
        })),
      },
    });
  } catch (error) {
    console.error("getVerificationStatus:", error);
    return sendError(res, req, 500, "Error fetching verification status");
  }
};

export const requestEmailOtp = async (req, res) => {
  try {
    if (!appConfig.enableEmailOtp) {
      return sendError(res, req, 503, "Email OTP verification is disabled");
    }

    const userId = String(req.body.userId || "").trim();
    const purpose = String(req.body.purpose || "EMAIL_VERIFICATION").trim().toUpperCase();
    if (!["EMAIL_VERIFICATION", "SENSITIVE_ACTION"].includes(purpose)) {
      return sendError(res, req, 400, "Invalid OTP purpose");
    }

    const user = await userModel.findById(userId).select("email emailVerifiedAt");
    if (!user) return sendError(res, req, 404, "User not found");

    if (purpose === "EMAIL_VERIFICATION" && user.emailVerifiedAt) {
      return sendSuccess(res, req, 200, {
        success: true,
        message: "Email already verified",
        data: { alreadyVerified: true },
      });
    }

    const result = await createAndSendEmailOtp({
      userId: user._id,
      email: user.email,
      purpose,
    });

    await writeAudit(req, {
      userId: user._id,
      action: "verification.email_otp_sent",
      resourceType: "user",
      resourceId: String(user._id),
      meta: { purpose, emailSent: result.sent },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Verification code sent if email delivery is configured",
      data: {
        purpose,
        expiresAt: result.expiresAt,
        emailSent: result.sent,
      },
    });
  } catch (error) {
    if (error.code === "OTP_COOLDOWN") {
      return sendError(res, req, 429, error.message, {
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    console.error("requestEmailOtp:", error);
    return sendError(res, req, 500, "Error sending verification code");
  }
};

export const verifyEmailOtpHandler = async (req, res) => {
  try {
    if (!appConfig.enableEmailOtp) {
      return sendError(res, req, 503, "Email OTP verification is disabled");
    }

    const userId = String(req.body.userId || "").trim();
    const code = String(req.body.code || "").trim();
    const purpose = String(req.body.purpose || "EMAIL_VERIFICATION").trim().toUpperCase();

    if (!code) return sendError(res, req, 400, "Verification code is required");
    if (!["EMAIL_VERIFICATION", "SENSITIVE_ACTION"].includes(purpose)) {
      return sendError(res, req, 400, "Invalid OTP purpose");
    }

    const user = await userModel.findById(userId).select("email emailVerifiedAt");
    if (!user) return sendError(res, req, 404, "User not found");

    const result = await verifyEmailOtp({
      userId: user._id,
      email: user.email,
      purpose,
      code,
    });

    if (!result.ok) {
      const messages = {
        not_found: "No active verification code. Request a new one.",
        expired: "Verification code expired. Request a new one.",
        max_attempts: "Too many failed attempts. Request a new code.",
        invalid_code: "Invalid verification code",
        invalid_input: "Invalid request",
      };
      return sendError(res, req, 400, messages[result.reason] || "Verification failed", {
        reason: result.reason,
        attemptsLeft: result.attemptsLeft,
      });
    }

    if (purpose === "EMAIL_VERIFICATION" && !user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await user.save();
    }

    await writeAudit(req, {
      userId: user._id,
      action: "verification.email_verified",
      resourceType: "user",
      resourceId: String(user._id),
      meta: { purpose },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: purpose === "EMAIL_VERIFICATION" ? "Email verified" : "Action verified",
      data: {
        emailVerified: Boolean(user.emailVerifiedAt),
        emailVerifiedAt: user.emailVerifiedAt || null,
      },
    });
  } catch (error) {
    console.error("verifyEmailOtpHandler:", error);
    return sendError(res, req, 500, "Error verifying code");
  }
};

export const registerTrustedDevice = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const fingerprint = String(req.body.fingerprint || "").trim();
    const label = String(req.body.label || "").trim().slice(0, 80);

    if (!fingerprint || fingerprint.length < 8) {
      return sendError(res, req, 400, "fingerprint is required (min 8 chars)");
    }

    const row = await userTrustedDeviceModel.findOneAndUpdate(
      { userId, fingerprint },
      {
        $set: { label, lastSeenAt: new Date() },
        $setOnInsert: { userId, fingerprint },
      },
      { upsert: true, new: true }
    );

    await writeAudit(req, {
      userId,
      action: "verification.device_registered",
      resourceType: "trustedDevice",
      resourceId: String(row._id),
      meta: { fingerprint: fingerprint.slice(0, 16) },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Device registered",
      data: {
        fingerprint: row.fingerprint,
        label: row.label,
        lastSeenAt: row.lastSeenAt,
      },
    });
  } catch (error) {
    console.error("registerTrustedDevice:", error);
    return sendError(res, req, 500, "Error registering device");
  }
};
