import mongoose from "mongoose";

export const ESCROW_STATUSES = [
  "HELD",
  "RELEASE_ELIGIBLE",
  "RELEASED",
  "DISPUTE_OPENED",
  "CANCELLED",
];

const orderEscrowSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      required: true,
      unique: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ESCROW_STATUSES,
      default: "HELD",
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, default: "", index: true },
    razorpayPaymentId: { type: String, default: "", index: true },
    razorpayPayoutId: { type: String, default: "" },
    razorpayRefundId: { type: String, default: "", index: true },
    capturedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null, index: true },
    /** Phase Y: admin bypass for fraud-blocked payout */
    payoutFraudOverride: {
      allowed: { type: Boolean, default: false },
      reasonCode: { type: String, default: "" },
      note: { type: String, default: "" },
      adminUserId: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    lastPayoutFraudBlock: {
      reasons: { type: [String], default: [] },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const orderEscrowModel =
  mongoose.models.orderEscrow || mongoose.model("orderEscrow", orderEscrowSchema);

export default orderEscrowModel;
