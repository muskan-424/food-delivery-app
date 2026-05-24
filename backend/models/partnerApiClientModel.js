import mongoose from "mongoose";

const partnerApiClientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    secretHash: { type: String, required: true },
    scopes: { type: [String], default: [] },
    active: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

const partnerApiClientModel =
  mongoose.models.partnerApiClient ||
  mongoose.model("partnerApiClient", partnerApiClientSchema);

export default partnerApiClientModel;
