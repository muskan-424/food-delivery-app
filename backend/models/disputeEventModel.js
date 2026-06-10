import mongoose from "mongoose";

export const DISPUTE_EVENT_TYPES = [
  "OPENED",
  "STATUS_CHANGED",
  "CUSTOMER_REPLY",
  "ESCROW_DISPUTE_OPENED",
  "RESOLVED_RELEASE",
  "RESOLVED_REFUND",
  "RESOLVED_NONE",
];

const disputeEventSchema = new mongoose.Schema(
  {
    disputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "dispute",
      required: true,
      index: true,
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "order", index: true },
    type: { type: String, enum: DISPUTE_EVENT_TYPES, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    actor: {
      kind: { type: String, default: "system" },
      id: { type: String, default: "" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const disputeEventModel =
  mongoose.models.disputeEvent || mongoose.model("disputeEvent", disputeEventSchema);

export default disputeEventModel;
