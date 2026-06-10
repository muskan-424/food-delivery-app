import mongoose from "mongoose";

const orderChatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "orderChatSession",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      required: true,
      index: true,
    },
    senderUserId: { type: String, required: true, index: true },
    senderRole: {
      type: String,
      enum: ["customer", "restaurant_staff", "delivery", "admin", "system"],
      required: true,
    },
    body: { type: String, required: true, maxlength: 4000 },
    locale: { type: String, default: "" },
    translatedBody: { type: String, default: "" },
    translationStatus: {
      type: String,
      enum: ["none", "pending", "done", "skipped"],
      default: "none",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

orderChatMessageSchema.index({ orderId: 1, createdAt: -1 });

const orderChatMessageModel =
  mongoose.models.orderChatMessage ||
  mongoose.model("orderChatMessage", orderChatMessageSchema);

export default orderChatMessageModel;
