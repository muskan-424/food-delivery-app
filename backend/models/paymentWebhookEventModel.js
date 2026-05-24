import mongoose from "mongoose";

/** Idempotent webhook delivery log (provider + eventId unique). */
const paymentWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    eventId: { type: String, required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "payment", default: null },
    /** Normalized outcome from webhook payload (for reconciliation vs DB). */
    reportedStatus: {
      type: String,
      enum: ["success", "failed", "cancelled"],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

paymentWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
paymentWebhookEventSchema.index({ paymentId: 1, createdAt: -1 });
paymentWebhookEventSchema.index({ createdAt: -1 });

const paymentWebhookEventModel =
  mongoose.models.paymentWebhookEvent ||
  mongoose.model("paymentWebhookEvent", paymentWebhookEventSchema);

export default paymentWebhookEventModel;
