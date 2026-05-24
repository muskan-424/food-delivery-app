import mongoose from "mongoose";

const analyticsExportSchema = new mongoose.Schema(
  {
    format: { type: String, enum: ["jsonl", "csv"], required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    requestedBy: { type: String, default: "", index: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    rowCount: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    fileName: { type: String, default: "" },
    filePath: { type: String, default: "" },
    error: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

analyticsExportSchema.index({ createdAt: -1 });

const analyticsExportModel =
  mongoose.models.analyticsExport ||
  mongoose.model("analyticsExport", analyticsExportSchema);

export default analyticsExportModel;

