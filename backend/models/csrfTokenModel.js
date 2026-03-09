import mongoose from "mongoose";

const csrfTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  createdAt: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String }
});

const CSRFToken = mongoose.models.csrfToken || mongoose.model("csrfToken", csrfTokenSchema);
export default CSRFToken;

