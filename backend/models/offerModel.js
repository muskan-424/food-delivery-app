import mongoose from "mongoose";

const offerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  offerType: { 
    type: String, 
    enum: [
      'payment_method_discount', // Discount on specific payment method
      'free_delivery', // Free delivery offer
      'first_order', // First order discount
      'referral', // Referral bonus
      'bulk_order', // Bulk order discount
      'festival', // Festival/special occasion
      'loyalty', // Loyalty program
      'other'
    ],
    required: true,
    index: true
  },
  discountType: { 
    type: String, 
    enum: ['percentage', 'fixed'], 
    default: 'percentage' 
  },
  discountValue: { type: Number, default: 0 }, // Percentage or fixed amount
  maxDiscount: { type: Number, default: null }, // Max discount for percentage
  minOrderAmount: { type: Number, default: 0 },
  // Payment method specific discount
  paymentMethod: { 
    type: String, 
    enum: ['upi', 'netbanking', 'credit_card', 'debit_card', 'wallet', 'cash_on_delivery', 'all'],
    default: 'all'
  },
  // Free delivery settings
  freeDeliveryThreshold: { type: Number, default: null }, // Order amount above which delivery is free
  freeDeliveryEnabled: { type: Boolean, default: false },
  // Validity
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  // Usage limits
  usageLimit: { type: Number, default: null }, // Total usage limit
  usageCount: { type: Number, default: 0 },
  userUsageLimit: { type: Number, default: 1 }, // Per user usage limit
  // Applicability
  applicableTo: {
    type: { type: String, enum: ['all', 'category', 'restaurant', 'food'], default: 'all' },
    ids: [{ type: String }]
  },
  // Priority (higher priority offers applied first)
  priority: { type: Number, default: 0 },
  // Status
  isActive: { type: Boolean, default: true, index: true },
  // Banner/Image
  bannerImage: { type: String, default: '' },
  bannerText: { type: String, default: '' },
  // Terms and conditions
  terms: { type: String, default: '' },
  // Linked coupon code (auto-generated)
  couponCode: { type: String, default: '', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

offerSchema.index({ validUntil: 1, isActive: 1 });
offerSchema.index({ offerType: 1, isActive: 1 });
offerSchema.index({ paymentMethod: 1, isActive: 1 });

offerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const offerModel = mongoose.models.offer || mongoose.model("offer", offerSchema);

export default offerModel;

