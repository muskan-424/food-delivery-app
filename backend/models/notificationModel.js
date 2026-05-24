import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    type: { type: String, default: "system" },
    read: { type: Boolean, default: false, index: true },
    refType: { type: String, default: "" },
    refId: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const notificationModel =
  mongoose.models.notification ||
  mongoose.model("notification", notificationSchema);

export default notificationModel;
