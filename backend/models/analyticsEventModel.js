import mongoose from "mongoose";

const analyticsEventSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, index: true },
    requestId: { type: String, default: "" },
    userId: { type: String, default: "", index: true },
    role: { type: String, default: "" },
    method: { type: String, default: "" },
    path: { type: String, default: "", index: true },
    statusCode: { type: Number, default: 0, index: true },
    durationMs: { type: Number, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

analyticsEventSchema.index({ createdAt: -1 });
analyticsEventSchema.index({ eventType: 1, createdAt: -1 });

const analyticsEventModel =
  mongoose.models.analyticsEvent ||
  mongoose.model("analyticsEvent", analyticsEventSchema);

export default analyticsEventModel;

