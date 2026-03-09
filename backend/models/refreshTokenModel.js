import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  createdAt: { type: Date, default: Date.now },
  revoked: { type: Boolean, default: false },
  revokedAt: { type: Date },
  ipAddress: { type: String },
  userAgent: { type: String }
});

const RefreshToken = mongoose.models.refreshToken || mongoose.model("refreshToken", refreshTokenSchema);
export default RefreshToken;

