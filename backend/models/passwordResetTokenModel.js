import mongoose from "mongoose";

const passwordResetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String }
});

const PasswordResetToken = mongoose.models.passwordResetToken || mongoose.model("passwordResetToken", passwordResetTokenSchema);
export default PasswordResetToken;

