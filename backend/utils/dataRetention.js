import userModel from "../models/userModel.js";
import UserActivity from "../models/userActivityModel.js";
import RefreshToken from "../models/refreshTokenModel.js";
import TokenBlacklist from "../models/tokenBlacklistModel.js";
import PasswordResetToken from "../models/passwordResetTokenModel.js";
import CSRFToken from "../models/csrfTokenModel.js";
import idempotencyModel from "../models/idempotencyModel.js";

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
  inactiveUsers: parseInt(process.env.INACTIVE_USER_RETENTION_DAYS || '730'), // 2 years
  anonymizedUsers: parseInt(process.env.ANONYMIZED_USER_RETENTION_DAYS || '90') // 90 days
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
  
  const results = {
    activityLogs: await cleanupActivityLogs(),
    exportFiles: await cleanupExportFiles(),
    inactiveUsers: await anonymizeInactiveUsers(),
    anonymizedUsers: await deleteAnonymizedUsers()
  };

  console.log('Data retention cleanup completed:', results);
  return results;
};

/**
 * Get retention policy information
 */
export const getRetentionPolicies = () => {
  return RETENTION_POLICIES;
};

