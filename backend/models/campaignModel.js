import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    message: { type: String, default: "", trim: true },
    segmentTags: { type: [String], default: [] },
    segmentMode: { type: String, enum: ["all", "any"], default: "all" },
    channels: { type: [String], default: ["in_app"] }, // in_app, email, sms, push
    status: { type: String, enum: ["draft", "active", "paused", "archived"], default: "draft" },
    lastPreviewAudienceCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
    lastRunAudienceCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  },
  { timestamps: true }
);

campaignSchema.index({ status: 1, createdAt: -1 });

const campaignModel =
  mongoose.models.campaign || mongoose.model("campaign", campaignSchema);

export default campaignModel;

