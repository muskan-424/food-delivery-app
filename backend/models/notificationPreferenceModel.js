import mongoose from "mongoose";

export const NOTIFICATION_CATEGORIES = ["order_status", "payment", "promo", "kyc", "system"];

const channelPrefSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: true },
  },
  { _id: false }
);

const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
      index: true,
    },
    categories: {
      order_status: { type: channelPrefSchema, default: () => ({}) },
      payment: { type: channelPrefSchema, default: () => ({}) },
      promo: {
        type: channelPrefSchema,
        default: () => ({ inApp: true, email: false, sms: false, push: true }),
      },
      kyc: { type: channelPrefSchema, default: () => ({}) },
      system: { type: channelPrefSchema, default: () => ({}) },
    },
  },
  { timestamps: true }
);

const notificationPreferenceModel =
  mongoose.models.notificationPreference ||
  mongoose.model("notificationPreference", notificationPreferenceSchema);

export default notificationPreferenceModel;
