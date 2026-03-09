import { exportUserData, anonymizeUser, deleteUserData } from "../utils/dataAnonymization.js";
import userModel from "../models/userModel.js";
import fs from "fs";
import path from "path";

/**
 * Export user data (GDPR Right to Data Portability)
 */
const exportUserDataRequest = async (req, res) => {
  try {
    const userId = req.body.userId;
    
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Mark export request
    user.dataExportRequested = true;
    user.dataExportRequestedAt = new Date();
    await user.save();

    // Export data
    const userData = await exportUserData(userId);

    // Optionally save to file (for large exports)
    const exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = `user_${userId}_${Date.now()}.json`;
    const filepath = path.join(exportDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(userData, null, 2));

    res.status(200).json({
      success: true,
      message: "Data export generated successfully",
      data: userData,
      downloadUrl: `/api/gdpr/download/${filename}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
  } catch (error) {
    console.error("Error exporting user data:", error);
    res.status(500).json({ success: false, message: "Error exporting user data" });
  }
};

/**
 * Download exported data file
 */
const downloadExport = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.body.userId;

    // Validate filename (prevent path traversal)
    if (!filename || filename.includes('..') || !filename.startsWith(`user_${userId}_`)) {
      return res.status(400).json({ success: false, message: "Invalid file" });
    }

    const filepath = path.join(process.cwd(), 'exports', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: "Export file not found" });
    }

    res.download(filepath, `user_data_export_${Date.now()}.json`, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        res.status(500).json({ success: false, message: "Error downloading file" });
      }
    });
  } catch (error) {
    console.error("Error downloading export:", error);
    res.status(500).json({ success: false, message: "Error downloading export" });
  }
};

/**
 * Request data deletion (GDPR Right to be Forgotten)
 */
const requestDataDeletion = async (req, res) => {
  try {
    const userId = req.body.userId;
    const { password } = req.body; // Require password confirmation

    if (!password) {
      return res.status(400).json({ success: false, message: "Password required for data deletion" });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Verify password
    const bcrypt = (await import("bcrypt")).default;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Mark deletion request
    user.dataDeletionRequested = true;
    user.dataDeletionRequestedAt = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Data deletion request submitted. Your data will be deleted within 30 days.",
      deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    console.error("Error requesting data deletion:", error);
    res.status(500).json({ success: false, message: "Error requesting data deletion" });
  }
};

/**
 * Anonymize user data (Admin or user-initiated)
 */
const anonymizeUserData = async (req, res) => {
  try {
    // If no userId in params, use authenticated user's ID
    const targetUserId = req.params.userId || req.body.userId;
    const userId = req.body.userId;
    const userRole = req.body.role;

    // User can only anonymize their own data, admin can anonymize any user
    if (userRole !== 'admin' && targetUserId !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await anonymizeUser(targetUserId);

    res.status(200).json({
      success: true,
      message: "User data anonymized successfully"
    });
  } catch (error) {
    console.error("Error anonymizing user data:", error);
    res.status(500).json({ success: false, message: "Error anonymizing user data" });
  }
};

/**
 * Delete user data completely (Admin only, or user after confirmation period)
 */
const deleteUserDataCompletely = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.body.userId;
    const userRole = req.body.role;

    // User can only delete their own data after 30-day period, admin can delete immediately
    if (userRole !== 'admin') {
      const user = await userModel.findById(targetUserId);
      if (!user || !user.dataDeletionRequested) {
        return res.status(400).json({ 
          success: false, 
          message: "Data deletion must be requested first" 
        });
      }

      const daysSinceRequest = (Date.now() - user.dataDeletionRequestedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceRequest < 30) {
        return res.status(400).json({
          success: false,
          message: `Data deletion will be processed after 30 days. ${Math.ceil(30 - daysSinceRequest)} days remaining.`
        });
      }
    }

    await deleteUserData(targetUserId);

    res.status(200).json({
      success: true,
      message: "User data deleted completely"
    });
  } catch (error) {
    console.error("Error deleting user data:", error);
    res.status(500).json({ success: false, message: "Error deleting user data" });
  }
};

export {
  exportUserDataRequest,
  downloadExport,
  requestDataDeletion,
  anonymizeUserData,
  deleteUserDataCompletely
};

