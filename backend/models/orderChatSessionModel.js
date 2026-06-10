import mongoose from "mongoose";

const orderChatSessionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      required: true,
      unique: true,
      index: true,
    },
    customerUserId: { type: String, required: true, index: true },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "restaurant",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
    lastMessageAt: { type: Date, default: null },
    messageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const orderChatSessionModel =
  mongoose.models.orderChatSession ||
  mongoose.model("orderChatSession", orderChatSessionSchema);

export default orderChatSessionModel;
