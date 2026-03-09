import mongoose from "mongoose";

const tokenBlacklistSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  createdAt: { type: Date, default: Date.now },
  reason: { type: String, default: 'logout' } // logout, security, rotation
});

const TokenBlacklist = mongoose.models.tokenBlacklist || mongoose.model("tokenBlacklist", tokenBlacklistSchema);
export default TokenBlacklist;

