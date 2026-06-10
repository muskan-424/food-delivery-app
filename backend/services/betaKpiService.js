import betaFeedbackModel from "../models/betaFeedbackModel.js";
import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import disputeModel from "../models/disputeModel.js";

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export async function getBetaKpiSnapshot() {
  const from7d = daysAgo(7);
  const [feedback7d, users7d, orders7d, openDisputes] = await Promise.all([
    betaFeedbackModel.countDocuments({ createdAt: { $gte: from7d } }),
    userModel.countDocuments({ createdAt: { $gte: from7d } }),
    orderModel.countDocuments({ createdAt: { $gte: from7d } }),
    disputeModel.countDocuments({
      status: { $in: ["open", "in_review", "awaiting_customer"] },
    }),
  ]);

  const feedbackByCategory = await betaFeedbackModel.aggregate([
    { $match: { createdAt: { $gte: from7d } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: 7,
    feedback7d,
    newUsers7d: users7d,
    orders7d,
    openDisputes,
    feedbackByCategory: Object.fromEntries(
      feedbackByCategory.map((r) => [r._id || "other", r.count])
    ),
  };
}
