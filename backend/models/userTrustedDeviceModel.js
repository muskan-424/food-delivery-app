import mongoose from "mongoose";

const userTrustedDeviceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    fingerprint: { type: String, required: true, trim: true },
    label: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userTrustedDeviceSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });

const userTrustedDeviceModel =
  mongoose.models.userTrustedDevice ||
  mongoose.model("userTrustedDevice", userTrustedDeviceSchema);

export default userTrustedDeviceModel;
