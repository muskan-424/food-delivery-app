import mongoose from "mongoose";

const internalNoteSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: {
      type: String,
      enum: ["open", "in_review", "awaiting_customer", "resolved", "closed"],
      required: true,
    },
    actorType: { type: String, enum: ["customer", "admin", "system"], required: true },
    actorId: { type: String, default: "" },
    note: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const customerReplySchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    disputeNumber: { type: String, unique: true, required: true, index: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ["order_issue", "payment", "delivery", "quality", "refund", "other"],
      default: "other",
    },
    subject: { type: String, default: "" },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "open",
        "in_review",
        "awaiting_customer",
        "resolved",
        "closed",
      ],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },
    resolution: { type: String, default: "" },
    /** Phase O: release funds to restaurant | refund customer | none */
    financialOutcome: {
      type: String,
      enum: ["none", "release", "refund", ""],
      default: "",
    },
    refundAmountInr: { type: Number, default: null },
    internalNotes: { type: [internalNoteSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    customerReplies: { type: [customerReplySchema], default: [] },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "payment",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

disputeSchema.index({ createdAt: -1 });
disputeSchema.index({ status: 1, createdAt: -1 });

const disputeModel =
  mongoose.models.dispute || mongoose.model("dispute", disputeSchema);

export default disputeModel;
