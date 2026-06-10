import mongoose from "mongoose";

const kycWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    providerReferenceId: { type: String, default: "" },
    status: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const kycWebhookEventModel =
  mongoose.models.kycWebhookEvent ||
  mongoose.model("kycWebhookEvent", kycWebhookEventSchema);

export default kycWebhookEventModel;
