import mongoose from "mongoose";

const abExperimentVariantSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0.0001 },
    label: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const abExperimentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "archived"],
      default: "draft",
      index: true,
    },
    description: { type: String, default: "", trim: true },
    variants: { type: [abExperimentVariantSchema], default: [] },
    audienceTags: { type: [String], default: [] },
    audienceMode: { type: String, enum: ["all", "any"], default: "any" },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
    lastResultAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const abExperimentModel =
  mongoose.models.abExperiment ||
  mongoose.model("abExperiment", abExperimentSchema);

export default abExperimentModel;
