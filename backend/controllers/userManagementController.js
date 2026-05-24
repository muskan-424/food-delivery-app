import userModel from "../models/userModel.js";
import UserActivity from "../models/userActivityModel.js";
import restaurantModel from "../models/restaurantModel.js";
import orderModel from "../models/orderModel.js";
import campaignModel from "../models/campaignModel.js";
import dynamicPricingAuditModel from "../models/dynamicPricingAuditModel.js";
import analyticsEventModel from "../models/analyticsEventModel.js";
import analyticsExportModel from "../models/analyticsExportModel.js";
import abExperimentModel from "../models/abExperimentModel.js";
import partnerApiClientModel from "../models/partnerApiClientModel.js";
import partnerApiAuditModel from "../models/partnerApiAuditModel.js";
import { splitPartnerScopesByCatalog } from "./partnerApiController.js";
import {
  exportAnalyticsEventsToFile,
  isExportPathAllowed,
} from "../services/analyticsExportService.js";
import {
  normalizeExperimentVariants,
  getExperimentAssignmentCounts,
  assignExperimentForUser,
} from "../services/abTestingService.js";
import { maskUserForAdmin } from "../utils/dataMaskingUtils.js";
import { normalizeSegmentTags } from "../services/segmentService.js";
import {
  getDynamicPricingAdminState,
  setDynamicPricingOverride,
  clearDynamicPricingOverride,
  setDynamicPricingRules,
} from "../services/dynamicPricingService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { RESTAURANT_STAFF_PERMISSIONS } from "../constants/restaurantStaffPermissions.js";
import { appConfig } from "../config/appConfig.js";

function normalizeUserAgentFingerprint(ua) {
  if (!ua || typeof ua !== "string") return "";
  const lower = ua.toLowerCase();
  if (lower.includes("android")) return "android";
  if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ios")) return "ios";
  if (lower.includes("windows")) return "windows";
  if (lower.includes("mac os") || lower.includes("macintosh")) return "mac";
  if (lower.includes("linux")) return "linux";
  return lower.slice(0, 40);
}

function buildFraudSignals(user, counts) {
  const sameIp = counts.ipCount || 0;
  const samePhone = counts.phoneCount || 0;
  const sameDevice = counts.deviceCount || 0;
  let riskScore = 0;
  if (sameIp >= 4) riskScore += 2;
  else if (sameIp >= 2) riskScore += 1;
  if (samePhone >= 2) riskScore += 3;
  if (sameDevice >= 6) riskScore += 2;
  else if (sameDevice >= 3) riskScore += 1;
  if (user.warnings > 0) riskScore += 1;

  const level = riskScore >= 5 ? "high" : riskScore >= 3 ? "medium" : "low";
  return {
    riskLevel: level,
    riskScore,
    duplicateSignals: {
      sameIpAccounts: sameIp,
      samePhoneAccounts: samePhone,
      sameDeviceFamilyAccounts: sameDevice,
    },
  };
}

const BULK_ACTION_LIMIT = 200;
const ALLOWED_RESTAURANT_STAFF_PERMISSIONS = RESTAURANT_STAFF_PERMISSIONS;

async function applyBlockToUser(user, adminId, reason) {
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found" };
  if (user.role === "admin") {
    return { ok: false, code: "ADMIN_NOT_ALLOWED", message: "Cannot block admin users" };
  }
  if (user.isBlocked) {
    return { ok: true, code: "ALREADY_BLOCKED", message: "Already blocked", user };
  }

  user.isBlocked = true;
  user.blockedAt = new Date();
  user.blockedBy = adminId;
  user.blockReason = reason || "Blocked by admin";
  await user.save();

  await UserActivity.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    activityType: "other",
    activityDescription: `User blocked by admin. Reason: ${user.blockReason}`,
    isAuthenticated: true,
    isSuspicious: true,
    suspiciousReason: "User blocked",
    metadata: { blockedBy: adminId, bulkAction: true },
  });

  return { ok: true, code: "BLOCKED", message: "Blocked", user };
}

async function applyWarningToUser(user, adminId, reason, activityId = null) {
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found" };
  if (user.role === "admin") {
    return { ok: false, code: "ADMIN_NOT_ALLOWED", message: "Cannot warn admin users" };
  }
  if (user.isBlocked) {
    return { ok: false, code: "ALREADY_BLOCKED", message: "User is already blocked" };
  }

  user.warnings += 1;
  const warningNumber = user.warnings;
  user.warningHistory.push({
    warningNumber,
    reason,
    givenBy: adminId,
    activityId: activityId || null,
  });

  if (user.warnings >= 3) {
    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockedBy = adminId;
    user.blockReason = `Auto-blocked after ${user.warnings} warnings. Last warning: ${reason}`;
  }

  await user.save();

  await UserActivity.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    activityType: "other",
    activityDescription: `Warning ${warningNumber}/3 given. Reason: ${reason}${user.warnings >= 3 ? " (User auto-blocked)" : ""}`,
    isAuthenticated: true,
    isSuspicious: true,
    suspiciousReason: `Warning given: ${reason}`,
    metadata: { warningNumber, givenBy: adminId, activityId, bulkAction: true },
  });

  return {
    ok: true,
    code: user.warnings >= 3 ? "WARNED_AND_BLOCKED" : "WARNED",
    message: user.warnings >= 3 ? "Warned and auto-blocked" : "Warned",
    user,
  };
}

async function applyUnblockToUser(user, adminId) {
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found" };
  if (!user.isBlocked) {
    return { ok: true, code: "ALREADY_UNBLOCKED", message: "Already unblocked", user };
  }

  user.isBlocked = false;
  user.blockedAt = null;
  user.blockedBy = null;
  user.blockReason = null;
  await user.save();

  await UserActivity.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    activityType: "other",
    activityDescription: "User unblocked by admin",
    isAuthenticated: true,
    metadata: { unblockedBy: adminId, bulkAction: true },
  });

  return { ok: true, code: "UNBLOCKED", message: "Unblocked", user };
}

// Get all users with activity summary
const getAllUsers = async (req, res) => {
  try {
    const { 
      search, 
      isBlocked, 
      warnings, 
      role,
      page = 1, 
      limit = 50 
    } = req.query;
    const requestedRiskLevel =
      typeof req.query.riskLevel === "string"
        ? req.query.riskLevel.toLowerCase()
        : "";
    const minRiskScore = Number(req.query.minRiskScore);
    const sortByRisk = req.query.sortBy === "riskScore";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const useRiskFilters =
      ["low", "medium", "high"].includes(requestedRiskLevel) ||
      Number.isFinite(minRiskScore) ||
      sortByRisk;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (isBlocked !== undefined) {
      query.isBlocked = isBlocked === 'true';
    }

    if (warnings) {
      query.warnings = parseInt(warnings);
    }

    if (role) {
      query.role = role;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const includeFraudContext = req.query.includeFraudContext === "true";

    const usersBaseQuery = userModel.find(query).select("-password");
    const users = useRiskFilters
      ? await usersBaseQuery.sort({ createdAt: -1 })
      : await usersBaseQuery
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit));

    // Check if admin wants full data
    const includeFullData = req.query.fullData === 'true';
    const ips = [...new Set(users.map((u) => u.ipAddress).filter(Boolean))];
    const phones = [...new Set(users.map((u) => u.phone).filter(Boolean))];
    const deviceFamilies = [...new Set(users.map((u) => normalizeUserAgentFingerprint(u.userAgent)).filter(Boolean))];

    const [ipBuckets, phoneBuckets, deviceBuckets] = await Promise.all([
      ips.length
        ? userModel.aggregate([
            { $match: { ipAddress: { $in: ips } } },
            { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
          ])
        : [],
      phones.length
        ? userModel.aggregate([
            { $match: { phone: { $in: phones } } },
            { $group: { _id: "$phone", count: { $sum: 1 } } },
          ])
        : [],
      deviceFamilies.length
        ? userModel
            .find({ userAgent: { $exists: true, $ne: null } })
            .select("userAgent")
            .lean()
            .then((rows) => {
              const counts = new Map();
              for (const r of rows) {
                const key = normalizeUserAgentFingerprint(r.userAgent);
                if (!key || !deviceFamilies.includes(key)) continue;
                counts.set(key, (counts.get(key) || 0) + 1);
              }
              return Array.from(counts.entries()).map(([k, v]) => ({ _id: k, count: v }));
            })
        : [],
    ]);
    const ipCountMap = new Map(ipBuckets.map((r) => [r._id, r.count]));
    const phoneCountMap = new Map(phoneBuckets.map((r) => [r._id, r.count]));
    const deviceCountMap = new Map(deviceBuckets.map((r) => [r._id, r.count]));

    // Get activity counts for each user
    let usersWithActivity = await Promise.all(
      users.map(async (user) => {
        const activityCount = await UserActivity.countDocuments({ userId: user._id });
        const suspiciousCount = await UserActivity.countDocuments({ 
          userId: user._id, 
          isSuspicious: true 
        });
        const lastActivity = await UserActivity.findOne({ userId: user._id })
          .sort({ createdAt: -1 })
          .select('createdAt activityType');

        const userData = {
          ...user.toObject(),
          activityCount,
          suspiciousActivityCount: suspiciousCount,
          lastActivity: lastActivity ? {
            date: lastActivity.createdAt,
            type: lastActivity.activityType
          } : null,
          fraudSignals: buildFraudSignals(user, {
            ipCount: ipCountMap.get(user.ipAddress) || 0,
            phoneCount: phoneCountMap.get(user.phone) || 0,
            deviceCount: deviceCountMap.get(
              normalizeUserAgentFingerprint(user.userAgent)
            ) || 0,
          }),
        };
        if (includeFraudContext) {
          userData.fraudContext = {
            ipAddress: user.ipAddress || "",
            phone: user.phone || "",
            deviceFamily: normalizeUserAgentFingerprint(user.userAgent),
          };
        }

        // Mask PII for admin list views (unless fullData requested)
        return includeFullData ? userData : maskUserForAdmin(userData, false);
      })
    );

    if (["low", "medium", "high"].includes(requestedRiskLevel)) {
      usersWithActivity = usersWithActivity.filter(
        (u) => u.fraudSignals?.riskLevel === requestedRiskLevel
      );
    }
    if (Number.isFinite(minRiskScore)) {
      usersWithActivity = usersWithActivity.filter(
        (u) => (u.fraudSignals?.riskScore || 0) >= minRiskScore
      );
    }
    if (sortByRisk) {
      usersWithActivity.sort(
        (a, b) =>
          ((a.fraudSignals?.riskScore || 0) - (b.fraudSignals?.riskScore || 0)) *
          sortOrder
      );
    }

    const total = useRiskFilters
      ? usersWithActivity.length
      : await userModel.countDocuments(query);
    const pagedUsers = useRiskFilters
      ? usersWithActivity.slice(skip, skip + parseInt(limit))
      : usersWithActivity;

    sendSuccess(res, req, 200, {
      success: true,
      data: pagedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    sendError(res, req, 500, "Error fetching users");
  }
};

const getHighRiskUsers = async (req, res) => {
  req.query = {
    ...req.query,
    riskLevel: "high",
    includeFraudContext: req.query.includeFraudContext || "true",
    sortBy: req.query.sortBy || "riskScore",
    sortOrder: req.query.sortOrder || "desc",
  };
  return getAllUsers(req, res);
};

const getFraudSummary = async (req, res) => {
  try {
    const now = new Date();
    const daysRaw = Number(req.query.days);
    const days = Number.isFinite(daysRaw)
      ? Math.max(1, Math.min(90, Math.floor(daysRaw)))
      : 30;
    const sampleLimitRaw = Number(req.query.sampleLimit);
    const sampleLimit = Number.isFinite(sampleLimitRaw)
      ? Math.max(5, Math.min(100, Math.floor(sampleLimitRaw)))
      : 25;
    const duplicateBucketLimitRaw = Number(req.query.duplicateBucketLimit);
    const duplicateBucketLimit = Number.isFinite(duplicateBucketLimitRaw)
      ? Math.max(3, Math.min(50, Math.floor(duplicateBucketLimitRaw)))
      : 10;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      usersRaw,
      suspiciousActivities,
      newUsersInWindow,
      topDuplicateIps,
      topDuplicatePhones,
      recentHighRiskSample,
    ] = await Promise.all([
      userModel.find({}).select("ipAddress phone userAgent warnings isBlocked createdAt").lean(),
      UserActivity.countDocuments({
        isSuspicious: true,
        createdAt: { $gte: since },
      }),
      userModel.countDocuments({ createdAt: { $gte: since } }),
      userModel.aggregate([
        { $match: { ipAddress: { $exists: true, $nin: ["", null] } } },
        { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
        { $match: { count: { $gte: 2 } } },
        { $sort: { count: -1 } },
        { $limit: duplicateBucketLimit },
      ]),
      userModel.aggregate([
        { $match: { phone: { $exists: true, $nin: ["", null] } } },
        { $group: { _id: "$phone", count: { $sum: 1 } } },
        { $match: { count: { $gte: 2 } } },
        { $sort: { count: -1 } },
        { $limit: duplicateBucketLimit },
      ]),
      userModel.find({}).select("name email ipAddress phone userAgent warnings isBlocked createdAt").sort({ createdAt: -1 }).limit(200).lean(),
    ]);

    const ipCounts = new Map(topDuplicateIps.map((r) => [r._id, r.count]));
    const phoneCounts = new Map(topDuplicatePhones.map((r) => [r._id, r.count]));
    const deviceCounts = new Map();
    for (const u of usersRaw) {
      const fam = normalizeUserAgentFingerprint(u.userAgent);
      if (!fam) continue;
      deviceCounts.set(fam, (deviceCounts.get(fam) || 0) + 1);
    }

    let lowRiskUsers = 0;
    let mediumRiskUsers = 0;
    let highRiskUsers = 0;
    for (const u of usersRaw) {
      const risk = buildFraudSignals(u, {
        ipCount: ipCounts.get(u.ipAddress) || 0,
        phoneCount: phoneCounts.get(u.phone) || 0,
        deviceCount: deviceCounts.get(normalizeUserAgentFingerprint(u.userAgent)) || 0,
      });
      if (risk.riskLevel === "high") highRiskUsers += 1;
      else if (risk.riskLevel === "medium") mediumRiskUsers += 1;
      else lowRiskUsers += 1;
    }

    const highRiskSample = recentHighRiskSample
      .map((u) => ({
        ...u,
        fraudSignals: buildFraudSignals(u, {
          ipCount: ipCounts.get(u.ipAddress) || 0,
          phoneCount: phoneCounts.get(u.phone) || 0,
          deviceCount: deviceCounts.get(normalizeUserAgentFingerprint(u.userAgent)) || 0,
        }),
      }))
      .filter((u) => u.fraudSignals?.riskLevel === "high")
      .slice(0, sampleLimit)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        warnings: u.warnings || 0,
        isBlocked: !!u.isBlocked,
        createdAt: u.createdAt,
        fraudSignals: u.fraudSignals,
      }));

    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        windowDays: days,
        sampleLimit,
        duplicateBucketLimit,
        generatedAt: now.toISOString(),
        users: {
          total: usersRaw.length,
          newInWindow: newUsersInWindow,
          byRisk: {
            low: lowRiskUsers,
            medium: mediumRiskUsers,
            high: highRiskUsers,
          },
        },
        suspiciousActivitiesInWindow: suspiciousActivities,
        duplicateBuckets: {
          ip: topDuplicateIps,
          phone: topDuplicatePhones,
        },
        highRiskSample,
      },
    });
  } catch (error) {
    console.error("getFraudSummary:", error);
    return sendError(res, req, 500, "Error loading fraud summary");
  }
};

// Get user details with full activity history
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      activityType, 
      isSuspicious, 
      startDate, 
      endDate,
      page = 1, 
      limit = 100 
    } = req.query;

    const user = await userModel.findById(userId).select('-password');
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Build activity query
    const activityQuery = { userId };
    if (activityType) activityQuery.activityType = activityType;
    if (isSuspicious !== undefined) activityQuery.isSuspicious = isSuspicious === 'true';
    if (startDate || endDate) {
      activityQuery.createdAt = {};
      if (startDate) activityQuery.createdAt.$gte = new Date(startDate);
      if (endDate) activityQuery.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const activities = await UserActivity.find(activityQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalActivities = await UserActivity.countDocuments(activityQuery);

    // Get statistics
    const stats = {
      totalActivities: await UserActivity.countDocuments({ userId }),
      suspiciousActivities: await UserActivity.countDocuments({ userId, isSuspicious: true }),
      unauthenticatedActivities: await UserActivity.countDocuments({ userId, isAuthenticated: false }),
      activitiesByType: await UserActivity.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: '$activityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      duplicateSignals: {
        sameIpAccounts: user.ipAddress
          ? await userModel.countDocuments({ ipAddress: user.ipAddress })
          : 0,
        samePhoneAccounts: user.phone
          ? await userModel.countDocuments({ phone: user.phone })
          : 0,
        sameDeviceFamilyAccounts: (() => {
          const family = normalizeUserAgentFingerprint(user.userAgent);
          return family
            ? userModel
                .find({ userAgent: { $exists: true, $ne: null } })
                .select("userAgent")
                .lean()
                .then((rows) =>
                  rows.filter(
                    (r) => normalizeUserAgentFingerprint(r.userAgent) === family
                  ).length
                )
            : Promise.resolve(0);
        })(),
      },
    };
    const resolvedDup = {
      sameIpAccounts: await stats.duplicateSignals.sameIpAccounts,
      samePhoneAccounts: await stats.duplicateSignals.samePhoneAccounts,
      sameDeviceFamilyAccounts: await stats.duplicateSignals.sameDeviceFamilyAccounts,
    };
    const risk = buildFraudSignals(user, {
      ipCount: resolvedDup.sameIpAccounts,
      phoneCount: resolvedDup.samePhoneAccounts,
      deviceCount: resolvedDup.sameDeviceFamilyAccounts,
    });
    stats.duplicateSignals = resolvedDup;
    stats.risk = risk;

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        user,
        activities,
        statistics: stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalActivities,
          totalPages: Math.ceil(totalActivities / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    sendError(res, req, 500, "Error fetching user details");
  }
};

// Block user
const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    const outcome = await applyBlockToUser(user, adminId, reason);
    if (!outcome.ok && outcome.code === "ADMIN_NOT_ALLOWED") {
      return sendError(res, req, 400, outcome.message);
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: outcome.code === "ALREADY_BLOCKED" ? "User already blocked" : "User blocked successfully",
      data: outcome.user || user
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    sendError(res, req, 500, "Error blocking user");
  }
};

// Unblock user
const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    const outcome = await applyUnblockToUser(user, adminId);

    sendSuccess(res, req, 200, {
      success: true,
      message:
        outcome.code === "ALREADY_UNBLOCKED"
          ? "User already unblocked"
          : "User unblocked successfully",
      data: outcome.user || user
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    sendError(res, req, 500, "Error unblocking user");
  }
};

const bulkUnblockUsers = async (req, res) => {
  try {
    const adminId = req.body.userId;
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return sendError(res, req, 400, "userIds array is required");
    }
    if (userIds.length > BULK_ACTION_LIMIT) {
      return sendError(res, req, 400, `Maximum ${BULK_ACTION_LIMIT} users per bulk action`);
    }

    const users = await userModel.find({ _id: { $in: userIds } });
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const results = [];
    let updated = 0;
    for (const uid of userIds) {
      const user = byId.get(String(uid));
      const out = await applyUnblockToUser(user, adminId);
      if (out.ok && out.code !== "ALREADY_UNBLOCKED") updated += 1;
      results.push({ userId: String(uid), ok: out.ok, code: out.code, message: out.message });
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Bulk unblock completed",
      data: {
        requested: userIds.length,
        updated,
        results,
      },
    });
  } catch (error) {
    console.error("Error bulk unblocking users:", error);
    sendError(res, req, 500, "Error bulk unblocking users");
  }
};

// Give warning to user
const giveWarning = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, activityId } = req.body;
    const adminId = req.body.userId;

    if (!reason) {
      return sendError(res, req, 400, "Warning reason is required");
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    const outcome = await applyWarningToUser(user, adminId, reason, activityId);
    if (!outcome.ok) {
      return sendError(res, req, 400, outcome.message);
    }
    const warningNumber = outcome.user.warnings;

    sendSuccess(res, req, 200, {
      success: true,
      message: outcome.user.warnings >= 3 
        ? `User has been given warning ${warningNumber}/3 and auto-blocked`
        : `Warning ${warningNumber}/3 given successfully`,
      data: outcome.user
    });
  } catch (error) {
    console.error('Error giving warning:', error);
    sendError(res, req, 500, "Error giving warning");
  }
};

const bulkBlockUsers = async (req, res) => {
  try {
    const adminId = req.body.userId;
    const { userIds, reason } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return sendError(res, req, 400, "userIds array is required");
    }
    if (userIds.length > BULK_ACTION_LIMIT) {
      return sendError(res, req, 400, `Maximum ${BULK_ACTION_LIMIT} users per bulk action`);
    }

    const users = await userModel.find({ _id: { $in: userIds } });
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const results = [];
    let updated = 0;
    for (const uid of userIds) {
      const user = byId.get(String(uid));
      const out = await applyBlockToUser(user, adminId, reason);
      if (out.ok && out.code !== "ALREADY_BLOCKED") updated += 1;
      results.push({ userId: String(uid), ok: out.ok, code: out.code, message: out.message });
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Bulk block completed",
      data: {
        requested: userIds.length,
        updated,
        results,
      },
    });
  } catch (error) {
    console.error("Error bulk blocking users:", error);
    sendError(res, req, 500, "Error bulk blocking users");
  }
};

const bulkWarnUsers = async (req, res) => {
  try {
    const adminId = req.body.userId;
    const { userIds, reason, activityId } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return sendError(res, req, 400, "userIds array is required");
    }
    if (!reason) {
      return sendError(res, req, 400, "Warning reason is required");
    }
    if (userIds.length > BULK_ACTION_LIMIT) {
      return sendError(res, req, 400, `Maximum ${BULK_ACTION_LIMIT} users per bulk action`);
    }

    const users = await userModel.find({ _id: { $in: userIds } });
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const results = [];
    let updated = 0;
    for (const uid of userIds) {
      const user = byId.get(String(uid));
      const out = await applyWarningToUser(user, adminId, reason, activityId);
      if (out.ok) updated += 1;
      results.push({ userId: String(uid), ok: out.ok, code: out.code, message: out.message });
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Bulk warn completed",
      data: {
        requested: userIds.length,
        updated,
        results,
      },
    });
  } catch (error) {
    console.error("Error bulk warning users:", error);
    sendError(res, req, 500, "Error bulk warning users");
  }
};

const bulkUserAction = async (req, res) => {
  const action = String(req.body.action || "").toLowerCase();
  if (action === "block") {
    return bulkBlockUsers(req, res);
  }
  if (action === "unblock") {
    return bulkUnblockUsers(req, res);
  }
  if (action === "warn") {
    return bulkWarnUsers(req, res);
  }
  return sendError(res, req, 400, "action must be one of: block, unblock, warn");
};

// Remove warning (reduce warning count)
const removeWarning = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    if (user.warnings > 0) {
      user.warnings -= 1;
      // Remove last warning from history
      if (user.warningHistory.length > 0) {
        user.warningHistory.pop();
      }
      await user.save();

      // Log the warning removal
      await UserActivity.create({
        userId: user._id,
        userEmail: user.email,
        userName: user.name,
        activityType: 'other',
        activityDescription: `Warning removed by admin. Current warnings: ${user.warnings}/3`,
        isAuthenticated: true,
        metadata: { removedBy: adminId }
      });
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Warning removed successfully",
      data: user
    });
  } catch (error) {
    console.error('Error removing warning:', error);
    sendError(res, req, 500, "Error removing warning");
  }
};

// Get all activities (admin dashboard)
const getAllActivities = async (req, res) => {
  try {
    const {
      userId,
      activityType,
      isSuspicious,
      isAuthenticated,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 100
    } = req.query;

    const query = {};

    if (userId) query.userId = userId;
    if (activityType) query.activityType = activityType;
    if (isSuspicious !== undefined) query.isSuspicious = isSuspicious === 'true';
    if (isAuthenticated !== undefined) query.isAuthenticated = isAuthenticated === 'true';
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { userEmail: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { activityDescription: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const activities = await UserActivity.find(query)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserActivity.countDocuments(query);

    // Get statistics
    const stats = {
      total,
      suspicious: await UserActivity.countDocuments({ ...query, isSuspicious: true }),
      unauthenticated: await UserActivity.countDocuments({ ...query, isAuthenticated: false }),
      byType: await UserActivity.aggregate([
        { $match: query },
        { $group: { _id: '$activityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    };

    sendSuccess(res, req, 200, {
      success: true,
      data: activities,
      statistics: stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    sendError(res, req, 500, "Error fetching activities");
  }
};

// Admin: Create user
const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return sendError(res, req, 400, "Name, email, and password are required");
    }

    // Check if user already exists
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return sendError(res, req, 409, "User with this email already exists");
    }

    // Hash password
    const bcrypt = (await import("bcrypt")).default;
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new userModel({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      role: role || 'user'
    });

    await user.save();

    // Log activity
    const UserActivity = (await import("../models/userActivityModel.js")).default;
    await UserActivity.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      activityType: 'signup',
      activityDescription: 'User account created by admin',
      isAuthenticated: false,
      metadata: { createdBy: req.body.userId }
    });

    sendSuccess(res, req, 201, {
      success: true,
      message: "User created successfully",
      data: { ...user.toObject(), password: undefined }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    sendError(res, req, 500, "Error creating user");
  }
};

// Admin: Delete user
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    if (user.role === 'admin') {
      return sendError(res, req, 400, "Cannot delete admin users");
    }

    // Check if user has active orders
    const orderModel = (await import("../models/orderModel.js")).default;
    const activeOrders = await orderModel.countDocuments({
      userId: userId,
      status: { $nin: ['delivered', 'cancelled', 'closed'] }
    });

    if (activeOrders > 0) {
      return sendError(
        res,
        req,
        400,
        `Cannot delete user with ${activeOrders} active order(s). Please cancel or complete orders first.`
      );
    }

    // Delete profile picture if exists
    if (user.profilePicture) {
      const fs = (await import("fs")).default;
      const path = (await import("path")).default;
      const filePath = path.join("uploads", path.basename(user.profilePicture));
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error("Error deleting profile picture:", err);
        }
      });
    }

    // Delete user
    await userModel.findByIdAndDelete(userId);

    // Log activity
    const UserActivity = (await import("../models/userActivityModel.js")).default;
    await UserActivity.create({
      userId: null,
      userEmail: user.email,
      userName: user.name,
      activityType: 'other',
      activityDescription: 'User account deleted by admin',
      isAuthenticated: false,
      metadata: { deletedBy: adminId }
    });

    sendSuccess(res, req, 200, {
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    sendError(res, req, 500, "Error deleting user");
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await userModel.countDocuments();
    const blockedUsers = await userModel.countDocuments({ isBlocked: true });
    const usersWithWarnings = await userModel.countDocuments({ warnings: { $gt: 0 } });
    const totalActivities = await UserActivity.countDocuments();
    const suspiciousActivities = await UserActivity.countDocuments({ isSuspicious: true });
    const unauthenticatedActivities = await UserActivity.countDocuments({ isAuthenticated: false });

    // Recent activities (last 24 hours)
    const recentActivities = await UserActivity.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    // Users with most warnings
    const topWarnedUsers = await userModel.find({ warnings: { $gt: 0 } })
      .select('name email warnings')
      .sort({ warnings: -1 })
      .limit(10);

    const duplicateIpBuckets = await userModel.aggregate([
      { $match: { ipAddress: { $exists: true, $nin: ["", null] } } },
      { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
      { $match: { count: { $gte: 2 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    const duplicatePhoneBuckets = await userModel.aggregate([
      { $match: { phone: { $exists: true, $nin: ["", null] } } },
      { $group: { _id: "$phone", count: { $sum: 1 } } },
      { $match: { count: { $gte: 2 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    const usersRaw = await userModel.find({})
      .select("ipAddress phone userAgent warnings isBlocked")
      .lean();
    let highRiskUsers = 0;
    let mediumRiskUsers = 0;
    const ipCounts = new Map(duplicateIpBuckets.map((r) => [r._id, r.count]));
    const phoneCounts = new Map(duplicatePhoneBuckets.map((r) => [r._id, r.count]));
    const deviceCounts = new Map();
    for (const u of usersRaw) {
      const fam = normalizeUserAgentFingerprint(u.userAgent);
      if (!fam) continue;
      deviceCounts.set(fam, (deviceCounts.get(fam) || 0) + 1);
    }
    for (const u of usersRaw) {
      const signals = buildFraudSignals(u, {
        ipCount: ipCounts.get(u.ipAddress) || 0,
        phoneCount: phoneCounts.get(u.phone) || 0,
        deviceCount: deviceCounts.get(normalizeUserAgentFingerprint(u.userAgent)) || 0,
      });
      if (signals.riskLevel === "high") highRiskUsers += 1;
      else if (signals.riskLevel === "medium") mediumRiskUsers += 1;
    }

    const now = new Date();
    const overdueGraceMinutes = appConfig.scheduledOrderOverdueGraceMinutes;
    const overdueBefore = new Date(now.getTime() - overdueGraceMinutes * 60 * 1000);
    const [scheduledAgg] = await orderModel.aggregate([
      { $match: { scheduledFor: { $ne: null } } },
      {
        $facet: {
          upcoming: [{ $match: { scheduledFor: { $gt: now } } }, { $count: "count" }],
          due: [
            { $match: { scheduledFor: { $lte: now }, status: "pending" } },
            { $count: "count" },
          ],
          overdue: [
            { $match: { scheduledFor: { $lte: overdueBefore }, status: "pending" } },
            { $count: "count" },
          ],
          totalScheduled: [{ $count: "count" }],
        },
      },
    ]);
    const pick = (arr) => (Array.isArray(arr) && arr[0]?.count ? arr[0].count : 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [
      usersWithReferralCode,
      referredUsers,
      loyaltyHolders,
      loyaltyPointsOutstandingAgg,
      loyaltyRedeemedIn30dAgg,
      campaignCountByStatus,
      campaignRunsIn30d,
      campaignReachIn30dAgg,
      dynamicPricingOrdersIn30d,
      dynamicPricingRevenueUpliftAgg,
      dynamicPricingAuditChangesIn30d,
    ] = await Promise.all([
      userModel.countDocuments({ referralCode: { $exists: true, $nin: ["", null] } }),
      userModel.countDocuments({ referredBy: { $type: "objectId" } }),
      userModel.countDocuments({ loyaltyPoints: { $gt: 0 } }),
      userModel.aggregate([
        { $match: { loyaltyPoints: { $gt: 0 } } },
        { $group: { _id: null, totalPoints: { $sum: "$loyaltyPoints" } } },
      ]),
      orderModel.aggregate([
        { $match: { date: { $gte: thirtyDaysAgo }, loyaltyRedeemInr: { $gt: 0 } } },
        { $group: { _id: null, totalRedeemedInr: { $sum: "$loyaltyRedeemInr" } } },
      ]),
      campaignModel.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      campaignModel.countDocuments({ lastRunAt: { $gte: thirtyDaysAgo } }),
      campaignModel.aggregate([
        { $match: { lastRunAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, totalAudience: { $sum: "$lastRunAudienceCount" } } },
      ]),
      orderModel.countDocuments({
        date: { $gte: thirtyDaysAgo },
        "dynamicPricingSnapshot.multiplier": { $gt: 1 },
      }),
      orderModel.aggregate([
        {
          $match: {
            date: { $gte: thirtyDaysAgo },
            "dynamicPricingSnapshot.multiplier": { $gt: 1 },
          },
        },
        {
          $project: {
            uplift: {
              $subtract: [
                { $ifNull: ["$amount", 0] },
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$dynamicPricingSnapshot.multiplier", 1] }, 0] },
                    {
                      $divide: [
                        { $ifNull: ["$amount", 0] },
                        { $ifNull: ["$dynamicPricingSnapshot.multiplier", 1] },
                      ],
                    },
                    0,
                  ],
                },
              ],
            },
          },
        },
        { $group: { _id: null, upliftInr: { $sum: "$uplift" } } },
      ]),
      dynamicPricingAuditModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);
    const campaignStatus = campaignCountByStatus.reduce(
      (acc, row) => ({ ...acc, [row._id || "unknown"]: row.count || 0 }),
      { draft: 0, active: 0, paused: 0, archived: 0 }
    );
    const loyaltyPointsOutstanding = Math.round(
      Number(loyaltyPointsOutstandingAgg?.[0]?.totalPoints || 0)
    );
    const loyaltyRedeemedIn30d = Math.round(
      Number(loyaltyRedeemedIn30dAgg?.[0]?.totalRedeemedInr || 0) * 100
    ) / 100;
    const campaignReach30d = Number(campaignReachIn30dAgg?.[0]?.totalAudience || 0);
    const dynamicPricingRevenueUpliftIn30d =
      Math.round(Number(dynamicPricingRevenueUpliftAgg?.[0]?.upliftInr || 0) * 100) / 100;

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        users: {
          total: totalUsers,
          blocked: blockedUsers,
          withWarnings: usersWithWarnings,
          active: totalUsers - blockedUsers
        },
        activities: {
          total: totalActivities,
          suspicious: suspiciousActivities,
          unauthenticated: unauthenticatedActivities,
          recent24h: recentActivities
        },
        fraud: {
          highRiskUsers,
          mediumRiskUsers,
          duplicateIpBuckets,
          duplicatePhoneBuckets,
        },
        scheduledOrders: {
          upcoming: pick(scheduledAgg?.upcoming),
          due: pick(scheduledAgg?.due),
          overdue: pick(scheduledAgg?.overdue),
          totalScheduled: pick(scheduledAgg?.totalScheduled),
          overdueGraceMinutes,
          generatedAt: now.toISOString(),
        },
        growth: {
          referrals: {
            usersWithReferralCode,
            referredUsers,
            referralConversionPct:
              usersWithReferralCode > 0
                ? Math.round((referredUsers / usersWithReferralCode) * 10000) / 100
                : 0,
          },
          loyalty: {
            usersWithPoints: loyaltyHolders,
            pointsOutstanding: loyaltyPointsOutstanding,
            redeemedIn30dInr: loyaltyRedeemedIn30d,
          },
          campaigns: {
            total: campaignCountByStatus.reduce((sum, row) => sum + (row.count || 0), 0),
            byStatus: campaignStatus,
            runsIn30d: campaignRunsIn30d,
            audienceReachedIn30d: campaignReach30d,
          },
          dynamicPricing: {
            enabled: appConfig.enableDynamicPricing,
            pricedOrdersIn30d: dynamicPricingOrdersIn30d,
            estimatedRevenueUpliftIn30d: dynamicPricingRevenueUpliftIn30d,
            adminChangesIn30d: dynamicPricingAuditChangesIn30d,
          },
          generatedAt: now.toISOString(),
        },
        topWarnedUsers
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    sendError(res, req, 500, "Error fetching dashboard statistics");
  }
};

const updateUserSegmentTags = async (req, res) => {
  try {
    const { userId } = req.params;
    const { segmentTags } = req.body;
    if (!Array.isArray(segmentTags)) {
      return sendError(res, req, 400, "segmentTags must be an array of strings");
    }
    const normalized = normalizeSegmentTags(segmentTags);
    const user = await userModel.findByIdAndUpdate(
      userId,
      { $set: { segmentTags: normalized } },
      { new: true }
    ).select("-password");
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    sendSuccess(res, req, 200, {
      success: true,
      message: "Segment tags updated",
      data: { userId: user._id, segmentTags: user.segmentTags },
    });
  } catch (error) {
    console.error("updateUserSegmentTags:", error);
    sendError(res, req, 500, "Error updating segment tags");
  }
};

const getSegmentTagCatalog = async (req, res) => {
  try {
    const rows = await userModel.aggregate([
      { $unwind: { path: "$segmentTags", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$segmentTags", userCount: { $sum: 1 } } },
      { $sort: { userCount: -1, _id: 1 } },
      { $limit: 200 },
    ]);
    sendSuccess(res, req, 200, {
      success: true,
      data: rows.map((r) => ({ tag: r._id, userCount: r.userCount })),
    });
  } catch (error) {
    console.error("getSegmentTagCatalog:", error);
    sendError(res, req, 500, "Error loading segment catalog");
  }
};

const previewSegmentAudience = async (req, res) => {
  try {
    const modeRaw = String(req.query.mode || req.body.mode || "all").toLowerCase();
    const mode = modeRaw === "any" ? "any" : "all";
    const tagsInput =
      req.body.tags ??
      (typeof req.query.tags === "string" ? req.query.tags.split(",") : []);
    const tags = normalizeSegmentTags(tagsInput);
    if (!tags.length) {
      return sendError(res, req, 400, "Provide tags as array or comma-separated list");
    }
    const query =
      mode === "any"
        ? { segmentTags: { $in: tags } }
        : { segmentTags: { $all: tags } };
    const [count, sample] = await Promise.all([
      userModel.countDocuments(query),
      userModel
        .find(query)
        .select("name email segmentTags createdAt")
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);
    sendSuccess(res, req, 200, {
      success: true,
      data: {
        mode,
        tags,
        audienceCount: count,
        sampleUsers: sample.map((u) => ({
          _id: u._id,
          name: u.name,
          email: u.email,
          segmentTags: u.segmentTags || [],
          createdAt: u.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("previewSegmentAudience:", error);
    sendError(res, req, 500, "Error previewing segment audience");
  }
};

const createCampaign = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const message = String(req.body.message || "").trim();
    const modeRaw = String(req.body.segmentMode || "all").toLowerCase();
    const segmentMode = modeRaw === "any" ? "any" : "all";
    const segmentTags = normalizeSegmentTags(req.body.segmentTags || []);
    const channelsInput = Array.isArray(req.body.channels) ? req.body.channels : ["in_app"];
    const channels = Array.from(
      new Set(
        channelsInput
          .map((c) => String(c || "").trim().toLowerCase())
          .filter((c) => ["in_app", "email", "sms", "push"].includes(c))
      )
    );
    if (!name) {
      return sendError(res, req, 400, "name is required");
    }
    if (!segmentTags.length) {
      return sendError(res, req, 400, "segmentTags is required");
    }
    const doc = await campaignModel.create({
      name,
      message,
      segmentTags,
      segmentMode,
      channels: channels.length ? channels : ["in_app"],
      status: "draft",
      createdBy: req.body.userId,
    });
    return sendSuccess(res, req, 201, {
      success: true,
      message: "Campaign created",
      data: doc,
    });
  } catch (error) {
    console.error("createCampaign:", error);
    return sendError(res, req, 500, "Error creating campaign");
  }
};

const listCampaigns = async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toLowerCase();
    const q = {};
    if (["draft", "active", "paused", "archived"].includes(status)) {
      q.status = status;
    }
    const rows = await campaignModel.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listCampaigns:", error);
    return sendError(res, req, 500, "Error listing campaigns");
  }
};

const previewCampaignAudience = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await campaignModel.findById(campaignId);
    if (!campaign) return sendError(res, req, 404, "Campaign not found");
    const query =
      campaign.segmentMode === "any"
        ? { segmentTags: { $in: campaign.segmentTags || [] } }
        : { segmentTags: { $all: campaign.segmentTags || [] } };
    const count = await userModel.countDocuments(query);
    campaign.lastPreviewAudienceCount = count;
    await campaign.save();
    return sendSuccess(res, req, 200, {
      success: true,
      data: { campaignId: campaign._id, audienceCount: count },
    });
  } catch (error) {
    console.error("previewCampaignAudience:", error);
    return sendError(res, req, 500, "Error previewing campaign audience");
  }
};

const runCampaignDry = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await campaignModel.findById(campaignId);
    if (!campaign) return sendError(res, req, 404, "Campaign not found");
    const query =
      campaign.segmentMode === "any"
        ? { segmentTags: { $in: campaign.segmentTags || [] } }
        : { segmentTags: { $all: campaign.segmentTags || [] } };
    const audienceCount = await userModel.countDocuments(query);
    campaign.lastRunAt = new Date();
    campaign.lastRunAudienceCount = audienceCount;
    await campaign.save();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Campaign dry-run recorded",
      data: {
        campaignId: campaign._id,
        channels: campaign.channels || [],
        audienceCount,
        dryRun: true,
        runAt: campaign.lastRunAt,
      },
    });
  } catch (error) {
    console.error("runCampaignDry:", error);
    return sendError(res, req, 500, "Error running campaign");
  }
};

const getDynamicPricingAdmin = async (req, res) => {
  try {
    const state = await getDynamicPricingAdminState();
    return sendSuccess(res, req, 200, { success: true, data: state });
  } catch (error) {
    console.error("getDynamicPricingAdmin:", error);
    return sendError(res, req, 500, "Error loading dynamic pricing state");
  }
};

const setDynamicPricingAdminOverride = async (req, res) => {
  try {
    const multiplier = Number(req.body.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return sendError(res, req, 400, "multiplier must be > 0");
    }
    const applied = await setDynamicPricingOverride(multiplier);
    await dynamicPricingAuditModel.create({
      action: "set_override",
      actorUserId: String(req.body.userId || ""),
      detail: { multiplier: applied },
    });
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Dynamic pricing override updated",
      data: { multiplier: applied },
    });
  } catch (error) {
    console.error("setDynamicPricingAdminOverride:", error);
    return sendError(res, req, 500, "Error setting dynamic pricing override");
  }
};

const clearDynamicPricingAdminOverride = async (req, res) => {
  try {
    await clearDynamicPricingOverride();
    await dynamicPricingAuditModel.create({
      action: "clear_override",
      actorUserId: String(req.body.userId || ""),
      detail: {},
    });
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Dynamic pricing override cleared",
    });
  } catch (error) {
    console.error("clearDynamicPricingAdminOverride:", error);
    return sendError(res, req, 500, "Error clearing dynamic pricing override");
  }
};

const setDynamicPricingAdminRules = async (req, res) => {
  try {
    if (!Array.isArray(req.body.rules)) {
      return sendError(res, req, 400, "rules must be an array");
    }
    const normalized = await setDynamicPricingRules(req.body.rules);
    await dynamicPricingAuditModel.create({
      action: "set_rules",
      actorUserId: String(req.body.userId || ""),
      detail: { count: normalized.length },
    });
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Dynamic pricing rules updated",
      data: { rules: normalized, count: normalized.length },
    });
  } catch (error) {
    console.error("setDynamicPricingAdminRules:", error);
    return sendError(res, req, 500, "Error setting dynamic pricing rules");
  }
};

const listDynamicPricingAudit = async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;
    const rows = await dynamicPricingAuditModel
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listDynamicPricingAudit:", error);
    return sendError(res, req, 500, "Error loading dynamic pricing audit");
  }
};

const listAnalyticsEvents = async (req, res) => {
  try {
    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;
    const skip = (page - 1) * limit;

    const eventType = String(req.query.eventType || "").trim();
    const method = String(req.query.method || "").trim().toUpperCase();
    const path = String(req.query.path || "").trim().slice(0, 200);
    const statusClass = String(req.query.statusClass || "").trim().toLowerCase();
    const statusCodeRaw = Number(req.query.statusCode);
    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    const q = {};
    if (eventType) q.eventType = eventType;
    if (method) q.method = method;
    if (path) q.path = { $regex: path, $options: "i" };
    if (statusClass === "4xx") q.statusCode = { $gte: 400, $lt: 500 };
    else if (statusClass === "5xx") q.statusCode = { $gte: 500, $lt: 600 };
    if (Number.isFinite(statusCodeRaw) && statusCodeRaw >= 100 && statusCodeRaw <= 599) {
      q.statusCode = Math.floor(statusCodeRaw);
    }
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (fromRaw && (!from || Number.isNaN(from.getTime()))) {
      return sendError(res, req, 400, "Invalid from date");
    }
    if (toRaw && (!to || Number.isNaN(to.getTime()))) {
      return sendError(res, req, 400, "Invalid to date");
    }
    if (from && to && from > to) {
      return sendError(res, req, 400, "from must be <= to");
    }
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = from;
      if (to) q.createdAt.$lte = to;
    }

    const [rows, total] = await Promise.all([
      analyticsEventModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      analyticsEventModel.countDocuments(q),
    ]);

    return sendSuccess(res, req, 200, {
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        eventType: eventType || null,
        method: method || null,
        path: path || null,
        statusClass: statusClass || null,
        statusCode: Number.isFinite(statusCodeRaw) ? Math.floor(statusCodeRaw) : null,
        from: fromRaw || null,
        to: toRaw || null,
      },
    });
  } catch (error) {
    console.error("listAnalyticsEvents:", error);
    return sendError(res, req, 500, "Error loading analytics events");
  }
};

const createAnalyticsExport = async (req, res) => {
  try {
    const formatRaw = String(req.body.format || "jsonl").trim().toLowerCase();
    const format = formatRaw === "csv" ? "csv" : "jsonl";
    const filters = {
      eventType: req.body.eventType,
      method: req.body.method,
      path: req.body.path,
      statusClass: req.body.statusClass,
      statusCode: req.body.statusCode,
      from: req.body.from,
      to: req.body.to,
    };

    const exportDoc = await analyticsExportModel.create({
      format,
      status: "pending",
      requestedBy: String(req.body.userId || ""),
      filters,
      startedAt: new Date(),
    });

    try {
      const out = await exportAnalyticsEventsToFile({ format, filters });
      exportDoc.status = "completed";
      exportDoc.fileName = out.fileName;
      exportDoc.filePath = out.filePath;
      exportDoc.rowCount = out.rowCount;
      exportDoc.bytes = out.bytes;
      exportDoc.completedAt = new Date();
      await exportDoc.save();
      return sendSuccess(res, req, 201, {
        success: true,
        message: "Analytics export created",
        data: {
          exportId: exportDoc._id,
          format: exportDoc.format,
          status: exportDoc.status,
          rowCount: exportDoc.rowCount,
          bytes: exportDoc.bytes,
          truncated: out.truncated,
          maxRows: out.maxRows,
          createdAt: exportDoc.createdAt,
        },
      });
    } catch (exportError) {
      exportDoc.status = "failed";
      exportDoc.error = exportError?.message || "analytics_export_failed";
      exportDoc.completedAt = new Date();
      await exportDoc.save();
      return sendError(res, req, 400, exportDoc.error);
    }
  } catch (error) {
    console.error("createAnalyticsExport:", error);
    return sendError(res, req, 500, "Error creating analytics export");
  }
};

const listAnalyticsExports = async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;
    const rows = await analyticsExportModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listAnalyticsExports:", error);
    return sendError(res, req, 500, "Error loading analytics exports");
  }
};

const downloadAnalyticsExport = async (req, res) => {
  try {
    const { exportId } = req.params;
    const row = await analyticsExportModel.findById(exportId).lean();
    if (!row) return sendError(res, req, 404, "Export not found");
    if (row.status !== "completed" || !row.filePath || !row.fileName) {
      return sendError(res, req, 400, "Export is not ready");
    }
    if (!isExportPathAllowed(row.filePath)) {
      return sendError(res, req, 400, "Invalid export path");
    }
    return res.download(row.filePath, row.fileName);
  } catch (error) {
    console.error("downloadAnalyticsExport:", error);
    return sendError(res, req, 500, "Error downloading analytics export");
  }
};

const updateUserRestaurantStaff = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;
    const { restaurantId, permissions, active } = req.body;

    if (!restaurantId) {
      return sendError(res, req, 400, "restaurantId is required");
    }
    const restaurant = await restaurantModel.findById(restaurantId).select("_id name");
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return sendError(res, req, 400, "permissions array is required");
    }
    const normalizedPermissions = [...new Set(permissions.map((p) => String(p).trim()))].filter(
      Boolean
    );
    const invalid = normalizedPermissions.filter(
      (p) => !ALLOWED_RESTAURANT_STAFF_PERMISSIONS.includes(p)
    );
    if (invalid.length > 0) {
      return sendError(
        res,
        req,
        400,
        `Invalid permissions: ${invalid.join(", ")}`,
        { allowed: ALLOWED_RESTAURANT_STAFF_PERMISSIONS }
      );
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    if (user.role === "admin") {
      return sendError(res, req, 400, "Cannot assign restaurant staff access to admin users");
    }

    user.restaurantStaff = {
      restaurantId,
      permissions: normalizedPermissions,
      active: active !== false,
    };
    await user.save();

    await UserActivity.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      activityType: "other",
      activityDescription: `Restaurant staff access assigned/updated for restaurant ${restaurant.name}`,
      isAuthenticated: true,
      metadata: {
        updatedBy: adminId,
        restaurantId: String(restaurant._id),
        permissions: normalizedPermissions,
        active: user.restaurantStaff.active,
      },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Restaurant staff access updated",
      data: {
        userId: user._id,
        restaurantStaff: user.restaurantStaff,
      },
    });
  } catch (error) {
    console.error("updateUserRestaurantStaff:", error);
    return sendError(res, req, 500, "Error updating restaurant staff access");
  }
};

const clearUserRestaurantStaff = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    user.restaurantStaff = {
      restaurantId: null,
      permissions: [],
      active: false,
    };
    await user.save();

    await UserActivity.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      activityType: "other",
      activityDescription: "Restaurant staff access cleared by admin",
      isAuthenticated: true,
      metadata: { updatedBy: adminId },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Restaurant staff access cleared",
      data: {
        userId: user._id,
        restaurantStaff: user.restaurantStaff,
      },
    });
  } catch (error) {
    console.error("clearUserRestaurantStaff:", error);
    return sendError(res, req, 500, "Error clearing restaurant staff access");
  }
};

const getRestaurantStaffPermissionCatalog = async (req, res) => {
  return sendSuccess(res, req, 200, {
    success: true,
    data: {
      permissions: ALLOWED_RESTAURANT_STAFF_PERMISSIONS,
      defaults: {
        menuAndInventory: ["menu.manage", "inventory.manage"],
        ops: ["order.manage", "restaurant.manage"],
      },
    },
  });
};

const createPartnerApiClient = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const { valid: scopes, invalid } = splitPartnerScopesByCatalog(
      req.body.scopes || []
    );
    if (!name) return sendError(res, req, 400, "name is required");
    if (invalid.length > 0) {
      return sendError(res, req, 400, "invalid scope values", { invalidScopes: invalid });
    }
    if (scopes.length === 0) return sendError(res, req, 400, "at least one scope is required");
    const clientId = `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const clientSecret = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const secretHash = await (await import("bcrypt")).default.hash(clientSecret, 10);
    const doc = await partnerApiClientModel.create({
      clientId,
      name,
      secretHash,
      scopes,
      active: true,
      createdBy: String(req.body.userId || ""),
    });
    return sendSuccess(res, req, 201, {
      success: true,
      message: "Partner API client created",
      data: {
        _id: doc._id,
        clientId: doc.clientId,
        clientSecret,
        name: doc.name,
        scopes: doc.scopes,
        active: doc.active,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    console.error("createPartnerApiClient:", error);
    return sendError(res, req, 500, "Error creating partner API client");
  }
};

const listPartnerApiClients = async (req, res) => {
  try {
    const rows = await partnerApiClientModel
      .find({})
      .select("_id clientId name scopes active lastUsedAt createdAt updatedAt createdBy")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listPartnerApiClients:", error);
    return sendError(res, req, 500, "Error loading partner API clients");
  }
};

const updatePartnerApiClientStatus = async (req, res) => {
  try {
    const { clientId } = req.params;
    const activeRaw = req.body.active;
    if (activeRaw !== true && activeRaw !== false) {
      return sendError(res, req, 400, "active must be true or false");
    }
    const row = await partnerApiClientModel.findOneAndUpdate(
      { clientId: String(clientId || "").trim() },
      { $set: { active: activeRaw } },
      { new: true }
    );
    if (!row) return sendError(res, req, 404, "Partner API client not found");
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Partner API client status updated",
      data: {
        clientId: row.clientId,
        active: row.active,
        updatedAt: row.updatedAt,
      },
    });
  } catch (error) {
    console.error("updatePartnerApiClientStatus:", error);
    return sendError(res, req, 500, "Error updating partner API client");
  }
};

const rotatePartnerApiClientSecret = async (req, res) => {
  try {
    const { clientId } = req.params;
    const row = await partnerApiClientModel.findOne({ clientId: String(clientId || "").trim() });
    if (!row) return sendError(res, req, 404, "Partner API client not found");
    const clientSecret = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    row.secretHash = await (await import("bcrypt")).default.hash(clientSecret, 10);
    await row.save();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Partner API client secret rotated",
      data: {
        clientId: row.clientId,
        clientSecret,
        scopes: row.scopes || [],
        active: !!row.active,
        updatedAt: row.updatedAt,
      },
    });
  } catch (error) {
    console.error("rotatePartnerApiClientSecret:", error);
    return sendError(res, req, 500, "Error rotating partner API client secret");
  }
};

const listPartnerApiAudit = async (req, res) => {
  try {
    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;
    const skip = (page - 1) * limit;
    const q = buildPartnerApiAuditQuery(req, res);
    if (!q) return;
    const [rows, total] = await Promise.all([
      partnerApiAuditModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      partnerApiAuditModel.countDocuments(q),
    ]);
    return sendSuccess(res, req, 200, {
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("listPartnerApiAudit:", error);
    return sendError(res, req, 500, "Error loading partner API audit logs");
  }
};

function buildPartnerApiAuditQuery(req, res) {
  const clientId = String(req.query.clientId || "").trim();
  const endpoint = String(req.query.endpoint || "").trim();
  const statusClass = String(req.query.statusClass || "").trim().toLowerCase();
  const fromRaw = String(req.query.from || "").trim();
  const toRaw = String(req.query.to || "").trim();
  const q = {};
  if (clientId) q.clientId = clientId;
  if (endpoint) q.endpoint = { $regex: endpoint, $options: "i" };
  if (statusClass === "2xx") q.statusCode = { $gte: 200, $lt: 300 };
  else if (statusClass === "4xx") q.statusCode = { $gte: 400, $lt: 500 };
  else if (statusClass === "5xx") q.statusCode = { $gte: 500, $lt: 600 };
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if (fromRaw && (!from || Number.isNaN(from.getTime()))) {
    sendError(res, req, 400, "Invalid from date");
    return null;
  }
  if (toRaw && (!to || Number.isNaN(to.getTime()))) {
    sendError(res, req, 400, "Invalid to date");
    return null;
  }
  if (from && to && from > to) {
    sendError(res, req, 400, "from must be <= to");
    return null;
  }
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = from;
    if (to) q.createdAt.$lte = to;
  }
  return q;
}

const exportPartnerApiAuditCsv = async (req, res) => {
  try {
    const q = buildPartnerApiAuditQuery(req, res);
    if (!q) return;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(5000, Math.floor(limitRaw)))
      : 1000;
    const rows = await partnerApiAuditModel.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    const csvRows = [
      [
        "createdAt",
        "clientId",
        "method",
        "endpoint",
        "statusCode",
        "durationMs",
        "authOutcome",
        "errorCode",
        "requestId",
        "ip",
      ],
      ...rows.map((r) => [
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
        r.clientId || "",
        r.method || "",
        r.endpoint || "",
        r.statusCode ?? "",
        r.durationMs ?? "",
        r.authOutcome || "",
        r.errorCode || "",
        r.requestId || "",
        r.ip || "",
      ]),
    ];
    const csv = csvRows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="partner_api_audit_${Date.now()}.csv"`
    );
    return res.status(200).send(csv);
  } catch (error) {
    console.error("exportPartnerApiAuditCsv:", error);
    return sendError(res, req, 500, "Error exporting partner API audit logs");
  }
};

const createAbExperiment = async (req, res) => {
  try {
    const key = String(req.body.key || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const variants = normalizeExperimentVariants(req.body.variants || []);
    const audienceTags = normalizeSegmentTags(req.body.audienceTags || []);
    const audienceMode = String(req.body.audienceMode || "any").toLowerCase() === "all" ? "all" : "any";
    const startAtRaw = String(req.body.startAt || "").trim();
    const endAtRaw = String(req.body.endAt || "").trim();
    const statusRaw = String(req.body.status || "draft").trim().toLowerCase();
    const status = ["draft", "active", "paused", "archived"].includes(statusRaw) ? statusRaw : "draft";
    if (!key || !/^[a-z0-9._-]{2,80}$/.test(key)) {
      return sendError(res, req, 400, "key must be 2-80 chars: lowercase letters, numbers, . _ -");
    }
    if (!name) {
      return sendError(res, req, 400, "name is required");
    }
    if (variants.length < 2) {
      return sendError(res, req, 400, "variants must include at least 2 valid entries");
    }
    const startAt = startAtRaw ? new Date(startAtRaw) : null;
    const endAt = endAtRaw ? new Date(endAtRaw) : null;
    if (startAtRaw && Number.isNaN(startAt?.getTime())) return sendError(res, req, 400, "Invalid startAt");
    if (endAtRaw && Number.isNaN(endAt?.getTime())) return sendError(res, req, 400, "Invalid endAt");
    if (startAt && endAt && startAt > endAt) return sendError(res, req, 400, "startAt must be <= endAt");

    const doc = await abExperimentModel.create({
      key,
      name,
      description,
      variants,
      audienceTags,
      audienceMode,
      startAt,
      endAt,
      status,
      createdBy: String(req.body.userId || ""),
    });
    return sendSuccess(res, req, 201, {
      success: true,
      message: "Experiment created",
      data: doc,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, req, 409, "Experiment key already exists");
    }
    console.error("createAbExperiment:", error);
    return sendError(res, req, 500, "Error creating experiment");
  }
};

const listAbExperiments = async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toLowerCase();
    const q = {};
    if (["draft", "active", "paused", "archived"].includes(status)) q.status = status;
    const rows = await abExperimentModel.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listAbExperiments:", error);
    return sendError(res, req, 500, "Error loading experiments");
  }
};

const updateAbExperimentStatus = async (req, res) => {
  try {
    const { experimentKey } = req.params;
    const statusRaw = String(req.body.status || "").trim().toLowerCase();
    if (!["draft", "active", "paused", "archived"].includes(statusRaw)) {
      return sendError(res, req, 400, "status must be draft|active|paused|archived");
    }
    const doc = await abExperimentModel.findOneAndUpdate(
      { key: String(experimentKey || "").toLowerCase() },
      { $set: { status: statusRaw } },
      { new: true }
    );
    if (!doc) return sendError(res, req, 404, "Experiment not found");
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Experiment status updated",
      data: doc,
    });
  } catch (error) {
    console.error("updateAbExperimentStatus:", error);
    return sendError(res, req, 500, "Error updating experiment");
  }
};

const getAbExperimentResults = async (req, res) => {
  try {
    const { experimentKey } = req.params;
    const key = String(experimentKey || "").trim().toLowerCase();
    const doc = await abExperimentModel.findOne({ key }).lean();
    if (!doc) return sendError(res, req, 404, "Experiment not found");
    const counts = await getExperimentAssignmentCounts(key);
    const total = Object.values(counts).reduce((sum, v) => sum + (Number(v) || 0), 0);
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        experiment: doc,
        assignments: {
          total,
          byVariant: counts,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("getAbExperimentResults:", error);
    return sendError(res, req, 500, "Error loading experiment results");
  }
};

const previewAbExperimentAssignmentForUser = async (req, res) => {
  try {
    const { experimentKey } = req.params;
    const userId = String(req.query.userId || req.body.userIdToPreview || "").trim();
    if (!userId) {
      return sendError(res, req, 400, "userId is required");
    }
    const user = await userModel.findById(userId).select("segmentTags");
    if (!user) return sendError(res, req, 404, "User not found");
    const result = await assignExperimentForUser({
      experimentKey,
      userId,
      userTags: user.segmentTags || [],
    });
    if (!result.ok) {
      if (result.code === "not_found") return sendError(res, req, 404, "Experiment not found");
      if (result.code === "not_active") return sendError(res, req, 400, "Experiment is not active");
      if (result.code === "not_in_audience") {
        return sendSuccess(res, req, 200, {
          success: true,
          data: {
            experimentKey: String(experimentKey || "").toLowerCase(),
            userId,
            eligible: false,
            variant: null,
          },
        });
      }
      return sendError(res, req, 400, "Invalid preview request");
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        ...result.data,
        userId,
        eligible: true,
      },
    });
  } catch (error) {
    console.error("previewAbExperimentAssignmentForUser:", error);
    return sendError(res, req, 500, "Error previewing assignment");
  }
};

export {
  getAllUsers,
  getHighRiskUsers,
  bulkBlockUsers,
  bulkUnblockUsers,
  bulkWarnUsers,
  bulkUserAction,
  getUserDetails,
  createUser,
  deleteUser,
  blockUser,
  unblockUser,
  giveWarning,
  removeWarning,
  getAllActivities,
  getFraudSummary,
  getDashboardStats,
  updateUserSegmentTags,
  getSegmentTagCatalog,
  previewSegmentAudience,
  createCampaign,
  listCampaigns,
  previewCampaignAudience,
  runCampaignDry,
  getDynamicPricingAdmin,
  setDynamicPricingAdminOverride,
  clearDynamicPricingAdminOverride,
  setDynamicPricingAdminRules,
  listDynamicPricingAudit,
  listAnalyticsEvents,
  createAnalyticsExport,
  listAnalyticsExports,
  downloadAnalyticsExport,
  createAbExperiment,
  listAbExperiments,
  updateAbExperimentStatus,
  getAbExperimentResults,
  previewAbExperimentAssignmentForUser,
  createPartnerApiClient,
  listPartnerApiClients,
  updatePartnerApiClientStatus,
  rotatePartnerApiClientSecret,
  listPartnerApiAudit,
  exportPartnerApiAuditCsv,
  updateUserRestaurantStaff,
  clearUserRestaurantStaff,
  getRestaurantStaffPermissionCatalog,
};

