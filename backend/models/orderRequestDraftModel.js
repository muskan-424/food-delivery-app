import mongoose from "mongoose";

const orderRequestDraftSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "restaurant",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "cancelled"],
      default: "draft",
      index: true,
    },
    rawInput: { type: String, required: true, maxlength: 8000 },
    aiSchema: { type: mongoose.Schema.Types.Mixed, required: true },
    userEdits: { type: mongoose.Schema.Types.Mixed, default: null },
    schemaProvider: { type: String, default: "rule" },
    aiExplain: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    validationErrors: { type: [String], default: [] },
  },
  { timestamps: true }
);

const orderRequestDraftModel =
  mongoose.models.orderRequestDraft ||
  mongoose.model("orderRequestDraft", orderRequestDraftSchema);

export default orderRequestDraftModel;
