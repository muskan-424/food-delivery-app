import mongoose from "mongoose";

const groupSplitPaymentSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "groupOrderSession",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, default: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    transactionId: { type: String, default: "", index: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

groupSplitPaymentSchema.index({ sessionId: 1, userId: 1 }, { unique: true });

const groupSplitPaymentModel =
  mongoose.models.groupSplitPayment ||
  mongoose.model("groupSplitPayment", groupSplitPaymentSchema);

export default groupSplitPaymentModel;
