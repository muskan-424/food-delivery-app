import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import reviewModel from "../models/reviewModel.js";
import paymentModel from "../models/paymentModel.js";
import UserActivity from "../models/userActivityModel.js";
import { hashPII } from "./encryptionUtils.js";
import crypto from "crypto";

/**
 * Anonymize user data for GDPR compliance
 * Replaces PII with anonymized values
 */
export const anonymizeUser = async (userId) => {
  try {
    const user = await userModel.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate anonymized identifiers
    const anonymizedEmail = `deleted_${hashPII(user.email, userId.toString())}@deleted.local`;
    const anonymizedName = `Deleted User ${hashPII(userId.toString()).substring(0, 8)}`;
    const anonymizedPhone = hashPII(user.phone || '', userId.toString()).substring(0, 10);

    // Anonymize user data
    user.name = anonymizedName;
    user.email = anonymizedEmail;
    user.phone = anonymizedPhone;
    user.profilePicture = '';
    user.password = crypto.randomBytes(32).toString('hex'); // Random hash, prevents login
    user.isBlocked = true;
    user.addresses = []; // Remove all addresses
    user.cartData = {};
    user.wishlist = [];
    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    user.activeSessions = [];
    
    // Mark as anonymized
    user.anonymizedAt = new Date();
    user.anonymized = true;

    await user.save();

    // Anonymize orders
    await orderModel.updateMany(
      { userId: userId.toString() },
      {
        $set: {
          'address.name': anonymizedName,
          'address.email': anonymizedEmail,
          'address.phone': anonymizedPhone,
          'address.addressLine1': '[ANONYMIZED]',
          'address.addressLine2': '',
          'address.pincode': '00000'
        }
      }
    );

    // Anonymize reviews
    await reviewModel.updateMany(
      { userId: userId.toString() },
      {
        $set: {
          userName: anonymizedName,
          userAvatar: ''
        }
      }
    );

    // Anonymize activity logs
    await UserActivity.updateMany(
      { userId },
      {
        $set: {
          userEmail: anonymizedEmail,
          userName: anonymizedName
        }
      }
    );

    return { success: true, message: 'User data anonymized successfully' };
  } catch (error) {
    console.error('Error anonymizing user:', error);
    throw error;
  }
};

/**
 * Export user data (GDPR right to data portability)
 */
export const exportUserData = async (userId) => {
  try {
    const user = await userModel.findById(userId).select('-password');
    if (!user) {
      throw new Error('User not found');
    }

    const orders = await orderModel.find({ userId: userId.toString() });
    const reviews = await reviewModel.find({ userId: userId.toString() });
    const payments = await paymentModel.find({ userId: userId.toString() });
    const activities = await UserActivity.find({ userId }).limit(1000).sort({ timestamp: -1 });

    return {
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      },
      addresses: user.addresses,
      orders: orders.map(order => ({
        orderNumber: order.orderNumber,
        items: order.items,
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt,
        address: order.address
      })),
      reviews: reviews.map(review => ({
        foodId: review.foodId,
        rating: review.rating,
        reviewText: review.reviewText,
        createdAt: review.createdAt
      })),
      payments: payments.map(payment => ({
        orderNumber: payment.orderNumber,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        createdAt: payment.createdAt
      })),
      activities: activities.map(activity => ({
        activityType: activity.activityType,
        activityDescription: activity.activityDescription,
        timestamp: activity.timestamp
      })),
      exportedAt: new Date()
    };
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw error;
  }
};

/**
 * Delete user data completely (GDPR right to be forgotten)
 */
export const deleteUserData = async (userId) => {
  try {
    // First anonymize
    await anonymizeUser(userId);

    // Then delete related data
    await orderModel.deleteMany({ userId: userId.toString() });
    await reviewModel.deleteMany({ userId: userId.toString() });
    await paymentModel.deleteMany({ userId: userId.toString() });
    await UserActivity.deleteMany({ userId });

    // Finally delete user
    await userModel.findByIdAndDelete(userId);

    return { success: true, message: 'User data deleted completely' };
  } catch (error) {
    console.error('Error deleting user data:', error);
    throw error;
  }
};

