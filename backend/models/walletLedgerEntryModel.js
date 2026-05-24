import mongoose from "mongoose";

/**
 * Append-only user wallet ledger (Phase 3). Balance = sum(amount) per userId in currency.
 * Positive amount = credit; negative = debit.
 */
const walletLedgerEntrySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    entryType: {
      type: String,
      required: true,
      maxlength: 64,
    },
    refType: { type: String, default: "" },
    refId: { type: String, default: "" },
    description: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

walletLedgerEntrySchema.index({ userId: 1, createdAt: -1 });
walletLedgerEntrySchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $exists: true, $nin: [null, ""] },
    },
  }
);

const walletLedgerEntryModel =
  mongoose.models.walletLedgerEntry ||
  mongoose.model("walletLedgerEntry", walletLedgerEntrySchema);

export default walletLedgerEntryModel;
