import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, default: "", index: true },
    resourceId: { type: String, default: "", index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

const auditLogModel =
  mongoose.models.auditLog || mongoose.model("auditLog", auditLogSchema);

export default auditLogModel;
