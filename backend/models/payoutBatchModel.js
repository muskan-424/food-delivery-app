import mongoose from "mongoose";

const byRestaurantSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "restaurant",
      required: true,
    },
    restaurantName: { type: String, default: "" },
    orderCount: { type: Number, default: 0 },
    itemsBasis: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    estimatedNet: { type: Number, default: 0 },
    minimumPayoutAmount: { type: Number, default: 0 },
    meetsMinimumPayout: { type: Boolean, default: true },
  },
  { _id: false }
);

const payoutBatchSchema = new mongoose.Schema({
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: {
    type: String,
    enum: ["draft", "finalized", "paid", "reconciled"],
    default: "draft",
    index: true,
  },
  currency: { type: String, default: "INR" },
  orderCount: { type: Number, default: 0 },
  totalCommission: { type: Number, default: 0 },
  totalEstimatedRestaurantNet: { type: Number, default: 0 },
  byRestaurant: { type: [byRestaurantSchema], default: [] },
  notes: { type: String, default: "" },
  paidReference: { type: String, default: "" },
  finalizedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  reconciledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

payoutBatchSchema.index({ periodStart: 1, periodEnd: 1, createdAt: -1 });

payoutBatchSchema.pre("save", function preSave(next) {
  this.updatedAt = new Date();
  next();
});

const payoutBatchModel =
  mongoose.models.payoutBatch || mongoose.model("payoutBatch", payoutBatchSchema);

export default payoutBatchModel;
