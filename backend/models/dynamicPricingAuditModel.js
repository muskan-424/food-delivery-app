import mongoose from "mongoose";

const dynamicPricingAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["set_override", "clear_override", "set_rules"],
      required: true,
    },
    actorUserId: { type: String, default: "" },
    detail: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

dynamicPricingAuditSchema.index({ createdAt: -1 });

const dynamicPricingAuditModel =
  mongoose.models.dynamicPricingAudit ||
  mongoose.model("dynamicPricingAudit", dynamicPricingAuditSchema);

export default dynamicPricingAuditModel;

