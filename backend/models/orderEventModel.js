import mongoose from "mongoose";

/**
 * Append-only order lifecycle events (Phase 0).
 * Use for timeline, audits, and future WebSocket fan-out.
 */
const orderEventSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      maxlength: 128,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    actor: {
      kind: { type: String, default: "system" },
      id: { type: String, default: "" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

orderEventSchema.index({ orderId: 1, createdAt: -1 });

const orderEventModel =
  mongoose.models.orderEvent || mongoose.model("orderEvent", orderEventSchema);

export default orderEventModel;
