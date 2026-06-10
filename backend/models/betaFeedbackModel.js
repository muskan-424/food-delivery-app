import mongoose from "mongoose";

const BETA_FEEDBACK_CATEGORIES = ["bug", "ux", "payment", "delivery", "other"];

const betaFeedbackSchema = new mongoose.Schema(
  {
    userId: { type: String, default: "" },
    email: { type: String, default: "" },
    category: {
      type: String,
      enum: BETA_FEEDBACK_CATEGORIES,
      default: "other",
    },
    message: { type: String, required: true },
    pagePath: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

betaFeedbackSchema.index({ category: 1, createdAt: -1 });

const betaFeedbackModel =
  mongoose.models.betaFeedback || mongoose.model("betaFeedback", betaFeedbackSchema);

export { BETA_FEEDBACK_CATEGORIES };
export default betaFeedbackModel;
