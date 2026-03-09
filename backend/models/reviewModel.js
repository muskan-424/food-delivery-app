import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: '' },
  userAvatar: { type: String, default: '' },
  foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'food', required: true, index: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'restaurant', index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order', index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  images: [{ type: String }],
  isVerified: { type: Boolean, default: false }, // Verified purchase
  helpful: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, // Admin moderation
  isVisible: { type: Boolean, default: true }, // Admin can hide reviews
  // Sentiment Analysis
  sentiment: {
    label: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
    score: { type: Number, default: 0 }, // Text sentiment score (-5 to +5)
    confidence: { type: Number, default: 0 }, // Confidence percentage (0-100)
    analyzedAt: { type: Date, default: Date.now }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index for faster queries
// Allow multiple reviews per food item per user, but only one per order
reviewSchema.index({ foodId: 1, userId: 1, orderId: 1 }, { unique: true }); // One review per user per food item per order
reviewSchema.index({ orderId: 1, userId: 1 }); // Index for querying reviews by order
reviewSchema.index({ restaurantId: 1, createdAt: -1 });

reviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const reviewModel = mongoose.models.review || mongoose.model("review", reviewSchema);
export default reviewModel;

