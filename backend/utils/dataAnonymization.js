import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import reviewModel from "../models/reviewModel.js";
import paymentModel from "../models/paymentModel.js";
import UserActivity from "../models/userActivityModel.js";
import disputeModel from "../models/disputeModel.js";
import notificationModel from "../models/notificationModel.js";
import walletLedgerEntryModel from "../models/walletLedgerEntryModel.js";
import orderEventModel from "../models/orderEventModel.js";
import campaignModel from "../models/campaignModel.js";
import dynamicPricingAuditModel from "../models/dynamicPricingAuditModel.js";
import mongoose from "mongoose";
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
    const anonymizedUserId = `deleted_${hashPII(userId.toString()).substring(0, 16)}`;

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

    // Anonymize growth/support entities that carry direct user identifiers
    await Promise.all([
      disputeModel.updateMany(
        { userId: userId.toString() },
        {
          $set: { userId: anonymizedUserId },
        }
      ),
      notificationModel.updateMany(
        { userId: userId.toString() },
        {
          $set: { userId: anonymizedUserId },
        }
      ),
      walletLedgerEntryModel.updateMany(
        { userId: userId.toString() },
        {
          $set: { userId: anonymizedUserId },
        }
      ),
      dynamicPricingAuditModel.updateMany(
        { actorUserId: userId.toString() },
        {
          $set: { actorUserId: anonymizedUserId },
        }
      ),
      // For admin-created campaigns, keep campaign record but scrub author linkage.
      campaignModel.updateMany(
        { createdBy: user._id },
        {
          $unset: { createdBy: 1 },
        }
      ).catch(() => null),
    ]);

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
    const disputes = await disputeModel.find({ userId: userId.toString() }).sort({ createdAt: -1 });
    const notifications = await notificationModel
      .find({ userId: userId.toString() })
      .sort({ createdAt: -1 })
      .limit(1000);
    const walletLedgerEntries = await walletLedgerEntryModel
      .find({ userId: userId.toString() })
      .sort({ createdAt: -1 })
      .limit(5000);
    const orderIds = orders.map((o) => o._id);
    const orderEvents = orderIds.length
      ? await orderEventModel.find({ orderId: { $in: orderIds } }).sort({ createdAt: -1 }).limit(5000)
      : [];
    const objectUserId = mongoose.Types.ObjectId.isValid(String(userId))
      ? new mongoose.Types.ObjectId(String(userId))
      : null;
    const [campaignsCreated, dynamicPricingAuditActions] = await Promise.all([
      objectUserId
        ? campaignModel.find({ createdBy: objectUserId }).sort({ createdAt: -1 }).limit(1000)
        : [],
      dynamicPricingAuditModel.find({ actorUserId: String(userId) }).sort({ createdAt: -1 }).limit(1000),
    ]);
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
      disputes: disputes.map((d) => ({
        disputeNumber: d.disputeNumber,
        orderId: d.orderId,
        paymentId: d.paymentId,
        category: d.category,
        subject: d.subject,
        description: d.description,
        status: d.status,
        priority: d.priority,
        resolution: d.resolution,
        statusHistory: d.statusHistory || [],
        customerReplies: d.customerReplies || [],
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      notifications: notifications.map((n) => ({
        title: n.title,
        body: n.body,
        type: n.type,
        read: n.read,
        refType: n.refType,
        refId: n.refId,
        metadata: n.metadata || {},
        createdAt: n.createdAt,
      })),
      walletLedger: walletLedgerEntries.map((e) => ({
        amount: e.amount,
        currency: e.currency,
        entryType: e.entryType,
        refType: e.refType,
        refId: e.refId,
        description: e.description,
        metadata: e.metadata || {},
        createdAt: e.createdAt,
      })),
      orderEvents: orderEvents.map((e) => ({
        orderId: e.orderId,
        type: e.type,
        payload: e.payload || {},
        actor: e.actor || {},
        createdAt: e.createdAt,
      })),
      campaignsCreated: campaignsCreated.map((c) => ({
        name: c.name,
        status: c.status,
        segmentTags: c.segmentTags || [],
        segmentMode: c.segmentMode,
        channels: c.channels || [],
        lastRunAt: c.lastRunAt,
        lastRunAudienceCount: c.lastRunAudienceCount,
        createdAt: c.createdAt,
      })),
      dynamicPricingAuditActions: dynamicPricingAuditActions.map((a) => ({
        action: a.action,
        detail: a.detail || {},
        createdAt: a.createdAt,
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
    await disputeModel.deleteMany({ userId: userId.toString() });
    await notificationModel.deleteMany({ userId: userId.toString() });
    await walletLedgerEntryModel.deleteMany({ userId: userId.toString() });
    await dynamicPricingAuditModel.deleteMany({ actorUserId: userId.toString() });
    if (mongoose.Types.ObjectId.isValid(String(userId))) {
      await campaignModel.deleteMany({ createdBy: new mongoose.Types.ObjectId(String(userId)) });
    }
    await UserActivity.deleteMany({ userId });

    // Finally delete user
    await userModel.findByIdAndDelete(userId);

    return { success: true, message: 'User data deleted completely' };
  } catch (error) {
    console.error('Error deleting user data:', error);
    throw error;
  }
};

