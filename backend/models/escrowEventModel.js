import mongoose from "mongoose";

export const ESCROW_EVENT_TYPES = [
  "HELD",
  "PAYMENT_CAPTURED",
  "VERIFICATION_PASSED",
  "RELEASE_ELIGIBLE",
  "RELEASED",
  "PAYOUT_INITIATED",
  "PAYOUT_SUCCEEDED",
  "PAYOUT_FAILED",
  "REFUND_INITIATED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "CANCELLED",
];

const escrowEventSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "order", required: true, index: true },
    escrowId: { type: mongoose.Schema.Types.ObjectId, ref: "orderEscrow", required: true, index: true },
    type: { type: String, enum: ESCROW_EVENT_TYPES, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    actor: {
      kind: { type: String, default: "system" },
      id: { type: String, default: "" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

escrowEventSchema.index({ escrowId: 1, createdAt: 1 });

const escrowEventModel =
  mongoose.models.escrowEvent || mongoose.model("escrowEvent", escrowEventSchema);

export default escrowEventModel;
