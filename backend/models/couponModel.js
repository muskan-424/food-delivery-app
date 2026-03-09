import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: null }, // For percentage discounts
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  usageLimit: { type: Number, default: null }, // Total usage limit
  usageCount: { type: Number, default: 0 },
  userUsageLimit: { type: Number, default: 1 }, // Per user usage limit
  isActive: { type: Boolean, default: true },
  applicableTo: {
    type: { type: String, enum: ['all', 'category', 'restaurant', 'food'], default: 'all' },
    ids: [{ type: String }]
  },
  // Link to offer (if generated from offer)
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'offer', default: null },
  createdAt: { type: Date, default: Date.now }
});

couponSchema.index({ code: 1 });
couponSchema.index({ validUntil: 1, isActive: 1 });

const couponModel = mongoose.models.coupon || mongoose.model("coupon", couponSchema);
export default couponModel;

