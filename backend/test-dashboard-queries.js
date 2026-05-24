import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URL);

const userModel = (await import('./models/userModel.js')).default;
const orderModel = (await import('./models/orderModel.js')).default;
const campaignModel = (await import('./models/campaignModel.js')).default;
const dynamicPricingAuditModel = (await import('./models/dynamicPricingAuditModel.js')).default;

const { appConfig } = await import('./config/appConfig.js');

const steps = [
  ['countDocuments-users', () => userModel.countDocuments()],
  ['countDocuments-blocked', () => userModel.countDocuments({ isBlocked: true })],
  ['countDocuments-warnings', () => userModel.countDocuments({ warnings: { $gt: 0 } })],
  ['topWarnedUsers', () => userModel.find({ warnings: { $gt: 0 } }).select('name email warnings').sort({ warnings: -1 }).limit(10)],
  ['duplicateIpBuckets', () => userModel.aggregate([
    { $match: { ipAddress: { $exists: true, $nin: ["", null] } } },
    { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1 } }, { $limit: 10 }
  ])],
  ['scheduledAgg', () => {
    const now = new Date();
    const overdueGraceMinutes = appConfig.scheduledOrderOverdueGraceMinutes;
    const overdueBefore = new Date(now.getTime() - overdueGraceMinutes * 60 * 1000);
    return orderModel.aggregate([
      { $match: { scheduledFor: { $ne: null } } },
      { $facet: {
        upcoming: [{ $match: { scheduledFor: { $gt: now } } }, { $count: "count" }],
        due: [{ $match: { scheduledFor: { $lte: now }, status: "pending" } }, { $count: "count" }],
        overdue: [{ $match: { scheduledFor: { $lte: overdueBefore }, status: "pending" } }, { $count: "count" }],
        totalScheduled: [{ $count: "count" }],
      }}
    ]);
  }],
  ['campaignCountByStatus', () => campaignModel.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }
  ])],
  ['dynamicPricingOrdersIn30d', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return orderModel.countDocuments({ date: { $gte: thirtyDaysAgo }, "dynamicPricingSnapshot.multiplier": { $gt: 1 } });
  }],
  ['dynamicPricingAudit', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return dynamicPricingAuditModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
  }],
];

for (const [name, fn] of steps) {
  try {
    const result = await fn();
    console.log(`[OK] ${name}:`, Array.isArray(result) ? `${result.length} rows` : result);
  } catch (e) {
    console.error(`[FAIL] ${name}: ${e.message}`);
  }
}

process.exit(0);
