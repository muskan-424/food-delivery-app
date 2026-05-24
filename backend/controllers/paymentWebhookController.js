import paymentWebhookEventModel from "../models/paymentWebhookEventModel.js";
import { verifyPaymentWebhookSignature } from "../utils/paymentWebhookSignature.js";
import {
  verifyRazorpayWebhookSignature,
  verifyStripeWebhookSignature,
} from "../utils/paymentProviderWebhookVerify.js";
import {
  normalizeRazorpayWebhookBody,
  normalizeStripeWebhookBody,
} from "../utils/paymentProviderWebhookNormalize.js";
import {
  applyPaymentProviderStatus,
  findPaymentForWebhook,
} from "../services/paymentWebhookSyncService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

/**
 * POST /api/payment/webhook/:provider
 *
 * Generic JSON: { eventId, status, providerPaymentId?, paymentId?, transactionId? }
 * Header: X-Payment-Webhook-Signature: sha256=<hmac> over raw body (PAYMENT_WEBHOOK_SECRET)
 *
 * stripe: Stripe event JSON; Stripe-Signature + STRIPE_WEBHOOK_SECRET
 * razorpay: Razorpay event JSON; X-Razorpay-Signature + RAZORPAY_WEBHOOK_SECRET
 */
const handlePaymentWebhook = async (req, res) => {
  try {
    const provider = (req.params.provider || "generic").slice(0, 64).toLowerCase();
    const raw = req.rawBody;

    if (provider === "stripe") {
      const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripeSig = req.headers["stripe-signature"];
      if (!stripeSecret) {
        if (process.env.NODE_ENV === "production") {
          return sendError(res, req, 503, "STRIPE_WEBHOOK_SECRET is not configured");
        }
      } else if (!verifyStripeWebhookSignature(raw, stripeSig, stripeSecret)) {
        return sendError(res, req, 401, "Invalid Stripe webhook signature");
      }
    } else if (provider === "razorpay") {
      const rzSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const rzSig =
        req.headers["x-razorpay-signature"] || req.headers["X-Razorpay-Signature"];
      if (!rzSecret) {
        if (process.env.NODE_ENV === "production") {
          return sendError(res, req, 503, "RAZORPAY_WEBHOOK_SECRET is not configured");
        }
      } else if (!verifyRazorpayWebhookSignature(raw, rzSig, rzSecret)) {
        return sendError(res, req, 401, "Invalid Razorpay webhook signature");
      }
    } else {
      const secret = process.env.PAYMENT_WEBHOOK_SECRET;
      if (secret) {
        const sig =
          req.headers["x-payment-webhook-signature"] ||
          req.headers["x-webhook-signature"];
        if (!verifyPaymentWebhookSignature(raw, sig, secret)) {
          return sendError(res, req, 401, "Invalid webhook signature");
        }
      } else if (process.env.NODE_ENV === "production") {
        return sendError(res, req, 503, "PAYMENT_WEBHOOK_SECRET is not configured");
      }
    }

    let body = { ...req.body };
    if (provider === "stripe") {
      const n = normalizeStripeWebhookBody(body);
      if (n) {
        Object.assign(body, n);
      } else if (typeof body.id === "string" && body.id.startsWith("evt_")) {
        return sendError(
          res,
          req,
          400,
          `Unsupported Stripe event type: ${body.type || "unknown"}`
        );
      }
    } else if (provider === "razorpay") {
      const n = normalizeRazorpayWebhookBody(body);
      if (n) {
        Object.assign(body, n);
      } else if (typeof body.event === "string") {
        return sendError(res, req, 400, `Unsupported Razorpay event: ${body.event}`);
      }
    }

    const eventId = body?.eventId;
    if (!eventId || typeof eventId !== "string") {
      return sendError(res, req, 400, "eventId is required");
    }

    const status = body?.status;
    if (!status || !["success", "failed", "cancelled"].includes(status)) {
      return sendError(res, req, 400, "status must be success, failed, or cancelled");
    }

    const payment = await findPaymentForWebhook({
      providerPaymentId: body.providerPaymentId,
      paymentId: body.paymentId,
    });

    if (!payment) {
      return sendError(res, req, 404, "Payment not found for providerPaymentId / paymentId");
    }

    try {
      await paymentWebhookEventModel.create({
        provider,
        eventId: String(eventId).slice(0, 256),
        paymentId: payment._id,
        reportedStatus: status,
      });
    } catch (err) {
      if (err?.code === 11000) {
        return sendSuccess(res, req, 200, {
          success: true,
          message: "Event already processed",
          duplicate: true,
        });
      }
      throw err;
    }

    await applyPaymentProviderStatus(payment, {
      status,
      transactionId: body.transactionId,
      providerPaymentId: body.providerPaymentId,
    });

    sendSuccess(res, req, 200, {
      success: true,
      message: "Webhook processed",
      data: { paymentId: payment._id, status: payment.status },
    });
  } catch (error) {
    console.error("payment webhook error:", error);
    sendError(res, req, 500, "Webhook processing failed");
  }
};

export { handlePaymentWebhook };
