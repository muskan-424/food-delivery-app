import mongoose from "mongoose";

const partnerApiAuditSchema = new mongoose.Schema(
  {
    clientId: { type: String, default: "", index: true },
    method: { type: String, default: "" },
    endpoint: { type: String, default: "", index: true },
    statusCode: { type: Number, default: 0, index: true },
    durationMs: { type: Number, default: 0 },
    requestId: { type: String, default: "" },
    ip: { type: String, default: "" },
    authOutcome: { type: String, default: "", index: true },
    errorCode: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

partnerApiAuditSchema.index({ createdAt: -1 });
partnerApiAuditSchema.index({ endpoint: 1, createdAt: -1 });

const partnerApiAuditModel =
  mongoose.models.partnerApiAudit ||
  mongoose.model("partnerApiAudit", partnerApiAuditSchema);

export default partnerApiAuditModel;
