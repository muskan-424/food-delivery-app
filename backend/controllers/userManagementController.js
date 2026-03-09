import userModel from "../models/userModel.js";
import UserActivity from "../models/userActivityModel.js";
import { maskUserForAdmin } from "../utils/dataMaskingUtils.js";

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

    const users = await userModel.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Check if admin wants full data
    const includeFullData = req.query.fullData === 'true';

    // Get activity counts for each user
    const usersWithActivity = await Promise.all(
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
          } : null
        };

        // Mask PII for admin list views (unless fullData requested)
        return includeFullData ? userData : maskUserForAdmin(userData, false);
      })
    );

    const total = await userModel.countDocuments(query);

    res.status(200).json({
      success: true,
      data: usersWithActivity,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: "Error fetching users" });
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
      return res.status(404).json({ success: false, message: "User not found" });
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
      ])
    };

    res.status(200).json({
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
    res.status(500).json({ success: false, message: "Error fetching user details" });
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
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: "Cannot block admin users" });
    }

    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockedBy = adminId;
    user.blockReason = reason || 'Blocked by admin';

    await user.save();

    // Log the blocking activity
    await UserActivity.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      activityType: 'other',
      activityDescription: `User blocked by admin. Reason: ${user.blockReason}`,
      isAuthenticated: true,
      isSuspicious: true,
      suspiciousReason: 'User blocked',
      metadata: { blockedBy: adminId }
    });

    res.status(200).json({
      success: true,
      message: "User blocked successfully",
      data: user
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ success: false, message: "Error blocking user" });
  }
};

// Unblock user
const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isBlocked = false;
    user.blockedAt = null;
    user.blockedBy = null;
    user.blockReason = null;

    await user.save();

    // Log the unblocking activity
    await UserActivity.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      activityType: 'other',
      activityDescription: 'User unblocked by admin',
      isAuthenticated: true,
      metadata: { unblockedBy: adminId }
    });

    res.status(200).json({
      success: true,
      message: "User unblocked successfully",
      data: user
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ success: false, message: "Error unblocking user" });
  }
};

// Give warning to user
const giveWarning = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, activityId } = req.body;
    const adminId = req.body.userId;

    if (!reason) {
      return res.status(400).json({ success: false, message: "Warning reason is required" });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: "Cannot warn admin users" });
    }

    if (user.isBlocked) {
      return res.status(400).json({ success: false, message: "User is already blocked" });
    }

    // Increment warnings
    user.warnings += 1;
    const warningNumber = user.warnings;

    // Add to warning history
    user.warningHistory.push({
      warningNumber,
      reason,
      givenBy: adminId,
      activityId: activityId || null
    });

    // Auto-block if 3 warnings reached
    if (user.warnings >= 3) {
      user.isBlocked = true;
      user.blockedAt = new Date();
      user.blockedBy = adminId;
      user.blockReason = `Auto-blocked after ${user.warnings} warnings. Last warning: ${reason}`;
    }

    await user.save();

    // Log the warning
    await UserActivity.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      activityType: 'other',
      activityDescription: `Warning ${warningNumber}/3 given. Reason: ${reason}${user.warnings >= 3 ? ' (User auto-blocked)' : ''}`,
      isAuthenticated: true,
      isSuspicious: true,
      suspiciousReason: `Warning given: ${reason}`,
      metadata: { warningNumber, givenBy: adminId, activityId }
    });

    res.status(200).json({
      success: true,
      message: user.warnings >= 3 
        ? `User has been given warning ${warningNumber}/3 and auto-blocked`
        : `Warning ${warningNumber}/3 given successfully`,
      data: user
    });
  } catch (error) {
    console.error('Error giving warning:', error);
    res.status(500).json({ success: false, message: "Error giving warning" });
  }
};

// Remove warning (reduce warning count)
const removeWarning = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
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

    res.status(200).json({
      success: true,
      message: "Warning removed successfully",
      data: user
    });
  } catch (error) {
    console.error('Error removing warning:', error);
    res.status(500).json({ success: false, message: "Error removing warning" });
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

    res.status(200).json({
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
    res.status(500).json({ success: false, message: "Error fetching activities" });
  }
};

// Admin: Create user
const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email, and password are required" 
      });
    }

    // Check if user already exists
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "User with this email already exists" 
      });
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

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { ...user.toObject(), password: undefined }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: "Error creating user" });
  }
};

// Admin: Delete user
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.body.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: "Cannot delete admin users" });
    }

    // Check if user has active orders
    const orderModel = (await import("../models/orderModel.js")).default;
    const activeOrders = await orderModel.countDocuments({
      userId: userId,
      status: { $nin: ['delivered', 'cancelled', 'closed'] }
    });

    if (activeOrders > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete user with ${activeOrders} active order(s). Please cancel or complete orders first.` 
      });
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

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: "Error deleting user" });
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

    res.status(200).json({
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
        topWarnedUsers
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: "Error fetching dashboard statistics" });
  }
};

export {
  getAllUsers,
  getUserDetails,
  createUser,
  deleteUser,
  blockUser,
  unblockUser,
  giveWarning,
  removeWarning,
  getAllActivities,
  getDashboardStats
};

