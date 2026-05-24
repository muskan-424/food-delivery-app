import userModel from "../models/userModel.js";
import UserActivity from "../models/userActivityModel.js";
import RefreshToken from "../models/refreshTokenModel.js";
import TokenBlacklist from "../models/tokenBlacklistModel.js";
import PasswordResetToken from "../models/passwordResetTokenModel.js";
import CSRFToken from "../models/csrfTokenModel.js";
import idempotencyModel from "../models/idempotencyModel.js";
import notificationModel from "../models/notificationModel.js";
import disputeModel from "../models/disputeModel.js";
import dynamicPricingAuditModel from "../models/dynamicPricingAuditModel.js";
import analyticsExportModel from "../models/analyticsExportModel.js";

/**
 * Data Retention Policy Enforcement
 * Automatically cleans up old data based on retention policies
 */

// Retention periods (in days)
const RETENTION_POLICIES = {
  userActivity: parseInt(process.env.ACTIVITY_RETENTION_DAYS || '365'), // 1 year
  refreshTokens: 7, // Already handled by TTL
  tokenBlacklist: 30, // Already handled by TTL
  passwordResetTokens: 1, // Already handled by TTL
  csrfTokens: 1, // Already handled by TTL
  idempotencyKeys: 1, // Already handled by TTL
  exportFiles: 7, // 7 days
  analyticsExports: parseInt(process.env.ANALYTICS_EXPORT_RETENTION_DAYS || "30"), // 30 days
  notifications: parseInt(process.env.NOTIFICATION_RETENTION_DAYS || "365"), // 1 year
  closedDisputes: parseInt(process.env.CLOSED_DISPUTE_RETENTION_DAYS || "730"), // 2 years
  dynamicPricingAudit: parseInt(process.env.DYNAMIC_PRICING_AUDIT_RETENTION_DAYS || "365"), // 1 year
  inactiveUsers: parseInt(process.env.INACTIVE_USER_RETENTION_DAYS || '730'), // 2 years
  anonymizedUsers: parseInt(process.env.ANONYMIZED_USER_RETENTION_DAYS || '90') // 90 days
};

let lastDataRetentionRun = {
  startedAt: null,
  completedAt: null,
  ok: null,
  results: null,
  error: null,
};

/**
 * Clean up old activity logs
 */
export const cleanupActivityLogs = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.userActivity);

    const result = await UserActivity.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Cleaned up ${result.deletedCount} old activity logs`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up activity logs:', error);
    return 0;
  }
};

/**
 * Clean up old export files
 */
export const cleanupExportFiles = async () => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    
    const exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportDir)) {
      return 0;
    }

    const files = fs.readdirSync(exportDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.exportFiles);

    let deletedCount = 0;
    files.forEach(file => {
      const filepath = path.join(exportDir, file);
      const stats = fs.statSync(filepath);
      
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });

    console.log(`Cleaned up ${deletedCount} old export files`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up export files:', error);
    return 0;
  }
};

/**
 * Clean up old notifications
 */
export const cleanupNotifications = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.notifications);
    const result = await notificationModel.deleteMany({
      createdAt: { $lt: cutoffDate },
    });
    console.log(`Cleaned up ${result.deletedCount} old notifications`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error cleaning up notifications:", error);
    return 0;
  }
};

/**
 * Clean up old closed/resolved disputes
 */
export const cleanupClosedDisputes = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.closedDisputes);
    const result = await disputeModel.deleteMany({
      status: { $in: ["resolved", "closed"] },
      updatedAt: { $lt: cutoffDate },
    });
    console.log(`Cleaned up ${result.deletedCount} old resolved/closed disputes`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error cleaning up closed disputes:", error);
    return 0;
  }
};

/**
 * Clean up old dynamic pricing audit entries
 */
export const cleanupDynamicPricingAudit = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.dynamicPricingAudit);
    const result = await dynamicPricingAuditModel.deleteMany({
      createdAt: { $lt: cutoffDate },
    });
    console.log(`Cleaned up ${result.deletedCount} old dynamic pricing audits`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error cleaning up dynamic pricing audits:", error);
    return 0;
  }
};

/**
 * Clean up old analytics export artifacts + metadata rows.
 */
export const cleanupAnalyticsExports = async () => {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.analyticsExports);

    const rows = await analyticsExportModel
      .find({ createdAt: { $lt: cutoffDate } })
      .select("_id filePath")
      .lean();

    const exportBaseDir = path.resolve(process.cwd(), "exports", "analytics");
    let deletedFiles = 0;
    for (const row of rows) {
      const filePath = String(row?.filePath || "").trim();
      if (!filePath) continue;
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(exportBaseDir)) continue;
      try {
        await fs.unlink(resolved);
        deletedFiles += 1;
      } catch {
        // Ignore missing or unreadable files; metadata cleanup still proceeds.
      }
    }

    const result = await analyticsExportModel.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    console.log(
      `Cleaned up ${result.deletedCount} old analytics exports metadata and ${deletedFiles} files`
    );
    return { deletedMetadata: result.deletedCount, deletedFiles };
  } catch (error) {
    console.error("Error cleaning up analytics exports:", error);
    return { deletedMetadata: 0, deletedFiles: 0 };
  }
};

/**
 * Anonymize inactive users (after retention period)
 */
export const anonymizeInactiveUsers = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.inactiveUsers);

    const inactiveUsers = await userModel.find({
      lastActivityAt: { $lt: cutoffDate },
      anonymized: false,
      role: 'user' // Don't anonymize admins
    });

    const { anonymizeUser } = await import("./dataAnonymization.js");
    let anonymizedCount = 0;

    for (const user of inactiveUsers) {
      try {
        await anonymizeUser(user._id);
        anonymizedCount++;
      } catch (error) {
        console.error(`Error anonymizing user ${user._id}:`, error);
      }
    }

    console.log(`Anonymized ${anonymizedCount} inactive users`);
    return anonymizedCount;
  } catch (error) {
    console.error('Error anonymizing inactive users:', error);
    return 0;
  }
};

/**
 * Delete anonymized users after retention period
 */
export const deleteAnonymizedUsers = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.anonymizedUsers);

    const result = await userModel.deleteMany({
      anonymized: true,
      anonymizedAt: { $lt: cutoffDate }
    });

    console.log(`Deleted ${result.deletedCount} anonymized users`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error deleting anonymized users:', error);
    return 0;
  }
};

/**
 * Run all cleanup tasks
 */
export const runDataRetentionCleanup = async () => {
  console.log('Starting data retention cleanup...');
  const startedAt = new Date();
  try {
    const results = {
      activityLogs: await cleanupActivityLogs(),
      exportFiles: await cleanupExportFiles(),
      notifications: await cleanupNotifications(),
      closedDisputes: await cleanupClosedDisputes(),
      dynamicPricingAudit: await cleanupDynamicPricingAudit(),
      analyticsExports: await cleanupAnalyticsExports(),
      inactiveUsers: await anonymizeInactiveUsers(),
      anonymizedUsers: await deleteAnonymizedUsers()
    };
    lastDataRetentionRun = {
      startedAt,
      completedAt: new Date(),
      ok: true,
      results,
      error: null,
    };
    console.log('Data retention cleanup completed:', results);
    return results;
  } catch (error) {
    lastDataRetentionRun = {
      startedAt,
      completedAt: new Date(),
      ok: false,
      results: null,
      error: error?.message || "unknown_error",
    };
    throw error;
  }
};

export const runDataRetentionDryRun = async () => {
  const startedAt = new Date();
  try {
    const fs = await import("fs");
    const path = await import("path");
    const now = new Date();

    const activityCutoff = new Date(now);
    activityCutoff.setDate(activityCutoff.getDate() - RETENTION_POLICIES.userActivity);
    const notifCutoff = new Date(now);
    notifCutoff.setDate(notifCutoff.getDate() - RETENTION_POLICIES.notifications);
    const disputeCutoff = new Date(now);
    disputeCutoff.setDate(disputeCutoff.getDate() - RETENTION_POLICIES.closedDisputes);
    const pricingCutoff = new Date(now);
    pricingCutoff.setDate(pricingCutoff.getDate() - RETENTION_POLICIES.dynamicPricingAudit);
    const analyticsExportCutoff = new Date(now);
    analyticsExportCutoff.setDate(
      analyticsExportCutoff.getDate() - RETENTION_POLICIES.analyticsExports
    );
    const inactiveCutoff = new Date(now);
    inactiveCutoff.setDate(inactiveCutoff.getDate() - RETENTION_POLICIES.inactiveUsers);
    const anonymizedCutoff = new Date(now);
    anonymizedCutoff.setDate(anonymizedCutoff.getDate() - RETENTION_POLICIES.anonymizedUsers);
    const exportFileCutoff = new Date(now);
    exportFileCutoff.setDate(exportFileCutoff.getDate() - RETENTION_POLICIES.exportFiles);

    let exportFiles = 0;
    try {
      const exportDir = path.join(process.cwd(), "exports");
      if (fs.existsSync(exportDir)) {
        const names = fs.readdirSync(exportDir);
        for (const name of names) {
          const full = path.join(exportDir, name);
          const st = fs.statSync(full);
          if (st.isFile() && st.mtime < exportFileCutoff) exportFiles += 1;
        }
      }
    } catch {
      exportFiles = 0;
    }

    const results = {
      activityLogs: await UserActivity.countDocuments({ createdAt: { $lt: activityCutoff } }),
      exportFiles,
      notifications: await notificationModel.countDocuments({ createdAt: { $lt: notifCutoff } }),
      closedDisputes: await disputeModel.countDocuments({
        status: { $in: ["resolved", "closed"] },
        updatedAt: { $lt: disputeCutoff },
      }),
      dynamicPricingAudit: await dynamicPricingAuditModel.countDocuments({
        createdAt: { $lt: pricingCutoff },
      }),
      analyticsExports: {
        deletedMetadata: await analyticsExportModel.countDocuments({
          createdAt: { $lt: analyticsExportCutoff },
        }),
        deletedFiles: 0,
      },
      inactiveUsers: await userModel.countDocuments({
        lastActivityAt: { $lt: inactiveCutoff },
        anonymized: false,
        role: "user",
      }),
      anonymizedUsers: await userModel.countDocuments({
        anonymized: true,
        anonymizedAt: { $lt: anonymizedCutoff },
      }),
    };

    return {
      dryRun: true,
      startedAt,
      completedAt: new Date(),
      ok: true,
      results,
    };
  } catch (error) {
    return {
      dryRun: true,
      startedAt,
      completedAt: new Date(),
      ok: false,
      results: null,
      error: error?.message || "unknown_error",
    };
  }
};

/**
 * Get retention policy information
 */
export const getRetentionPolicies = () => {
  return RETENTION_POLICIES;
};

export const getLastDataRetentionRun = () => {
  return lastDataRetentionRun;
};

