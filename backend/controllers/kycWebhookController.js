import crypto from "crypto";
import kycWebhookEventModel from "../models/kycWebhookEventModel.js";
import { appConfig } from "../config/appConfig.js";
import { applyKycProviderWebhook } from "../services/kycService.js";
import { writeAudit } from "../services/auditService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

function verifyKycWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = String(signature).replace(/^sha256=/i, "").trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export const handleKycWebhook = async (req, res) => {
  try {
    const secret = String(process.env.KYC_WEBHOOK_SECRET || "").trim();
    const isDev = process.env.NODE_ENV !== "production";

    if (!secret && !isDev) {
      return sendError(res, req, 503, "KYC webhook secret not configured");
    }

    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.headers["x-kyc-webhook-signature"] || req.headers["x-webhook-signature"];

    if (secret && !verifyKycWebhookSignature(rawBody, signature, secret)) {
      return sendError(res, req, 401, "Invalid webhook signature");
    }

    const payload = req.body || {};
    const eventId = String(
      payload.event_id || payload.eventId || payload.provider_reference_id || payload.providerReferenceId || ""
    ).trim();

    if (eventId) {
      try {
        await kycWebhookEventModel.create({
          eventId,
          providerReferenceId: String(
            payload.provider_reference_id || payload.providerReferenceId || ""
          ),
          status: String(payload.status || ""),
          payload,
        });
      } catch (e) {
        if (e?.code === 11000) {
          return sendSuccess(res, req, 200, {
            success: true,
            message: "Duplicate webhook ignored",
            data: { result: "duplicate" },
          });
        }
        throw e;
      }
    }

    const result = await applyKycProviderWebhook(payload);

    if (result.userId) {
      await writeAudit(req, {
        userId: null,
        action: "kyc.webhook_applied",
        resourceType: "user",
        resourceId: result.userId,
        meta: { status: payload.status, providerReferenceId: payload.provider_reference_id },
      });
    }

    return sendSuccess(res, req, 200, {
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("handleKycWebhook:", error);
    return sendError(res, req, 500, "Error processing KYC webhook");
  }
};
