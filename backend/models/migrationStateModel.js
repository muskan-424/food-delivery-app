import mongoose from "mongoose";

const migrationStateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    appliedAt: { type: Date, default: Date.now },
    checksum: { type: String, default: "" },
  },
  { timestamps: false }
);

const migrationStateModel =
  mongoose.models.migrationState ||
  mongoose.model("migrationState", migrationStateSchema);

export default migrationStateModel;
