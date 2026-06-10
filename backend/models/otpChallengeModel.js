import mongoose from "mongoose";

const OTP_PURPOSES = ["EMAIL_VERIFICATION", "SENSITIVE_ACTION"];

const otpChallengeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attemptCount: { type: Number, default: 0, min: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

otpChallengeSchema.index({ userId: 1, purpose: 1, consumedAt: 1, createdAt: -1 });

const otpChallengeModel =
  mongoose.models.otpChallenge || mongoose.model("otpChallenge", otpChallengeSchema);

export { OTP_PURPOSES };
export default otpChallengeModel;
