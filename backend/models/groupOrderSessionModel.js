import mongoose from "mongoose";

const groupOrderMemberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, default: "" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const groupOrderSplitShareSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const groupOrderSessionSchema = new mongoose.Schema(
  {
    inviteCode: { type: String, required: true, unique: true, index: true },
    leaderUserId: { type: String, required: true, index: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "restaurant", default: null },
    status: {
      type: String,
      enum: ["open", "ordered", "closed"],
      default: "open",
      index: true,
    },
    members: { type: [groupOrderMemberSchema], default: [] },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "order", default: null },
    splitPlan: {
      mode: { type: String, enum: ["equal"], default: "equal" },
      totalAmount: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
      shares: { type: [groupOrderSplitShareSchema], default: [] },
      updatedAt: { type: Date, default: null },
    },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

groupOrderSessionSchema.index({ leaderUserId: 1, createdAt: -1 });

const groupOrderSessionModel =
  mongoose.models.groupOrderSession ||
  mongoose.model("groupOrderSession", groupOrderSessionSchema);

export default groupOrderSessionModel;
