import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true,
    index: true 
  },
  userEmail: { type: String, required: true, index: true },
  userName: { type: String, required: true },
  activityType: { 
    type: String, 
    required: true,
    enum: [
      'login',
      'logout',
      'signup',
      'view_food',
      'add_to_cart',
      'remove_from_cart',
      'place_order',
      'cancel_order',
      'update_profile',
      'change_password',
      'add_address',
      'update_address',
      'delete_address',
      'add_review',
      'update_review',
      'delete_review',
      'add_to_wishlist',
      'remove_from_wishlist',
      'create_support_ticket',
      'send_message',
      'view_payment_history',
      'apply_coupon',
      'search',
      'filter',
      'other'
    ],
    index: true
  },
  activityDescription: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  requestMethod: { type: String },
  requestUrl: { type: String },
  requestBody: { type: mongoose.Schema.Types.Mixed },
  responseStatus: { type: Number },
  isAuthenticated: { type: Boolean, default: true, index: true },
  isSuspicious: { type: Boolean, default: false, index: true },
  suspiciousReason: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Indexes for efficient querying
userActivitySchema.index({ userId: 1, createdAt: -1 });
userActivitySchema.index({ activityType: 1, createdAt: -1 });
userActivitySchema.index({ isSuspicious: 1, createdAt: -1 });
userActivitySchema.index({ isAuthenticated: 1, createdAt: -1 });

// Compound index for admin dashboard queries
userActivitySchema.index({ userId: 1, activityType: 1, createdAt: -1 });

const UserActivity = mongoose.models.userActivity || mongoose.model("userActivity", userActivitySchema);

export default UserActivity;

