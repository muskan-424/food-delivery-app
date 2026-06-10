import mongoose from "mongoose";

const KYC_STATUSES = ["none", "pending", "verified", "rejected"];

const kycHistorySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: "" },
    toStatus: { type: String, required: true },
    note: { type: String, default: "" },
    actorId: { type: String, default: "" },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userKycProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: KYC_STATUSES.filter((s) => s !== "none"),
      default: "pending",
      index: true,
    },
    provider: { type: String, default: "stub" },
    providerReferenceId: { type: String, default: "", index: true },
    fullName: { type: String, default: "" },
    panLast4: { type: String, default: "" },
    aadhaarLast4: { type: String, default: "" },
    submittedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    history: { type: [kycHistorySchema], default: [] },
  },
  { timestamps: true }
);

const userKycProfileModel =
  mongoose.models.userKycProfile ||
  mongoose.model("userKycProfile", userKycProfileSchema);

export { KYC_STATUSES };
export default userKycProfileModel;
