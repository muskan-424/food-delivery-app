import userModel from "../models/userModel.js";
import reviewModel from "../models/reviewModel.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import validator from "validator";

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // User always sees their own full data (decryption handled by model hooks)
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching profile" });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (phone) {
      if (!validator.isMobilePhone(phone, 'any', { strictMode: false })) {
        return res.status(400).json({ success: false, message: "Invalid phone number" });
      }
      updateData.phone = phone.trim();
    }

    const user = await userModel.findByIdAndUpdate(
      req.body.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (updateData.name) {
      await reviewModel.updateMany(
        { userId: user._id.toString() },
        { userName: user.name }
      );
    }

    res.status(200).json({ success: true, message: "Profile updated successfully", data: user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating profile" });
  }
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image file is required" });
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      // Delete uploaded file if user not found
      fs.unlink(`uploads/${req.file.filename}`, () => {});
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Delete old profile picture if exists
    if (user.profilePicture) {
      const oldFilePath = path.join("uploads", path.basename(user.profilePicture));
      fs.unlink(oldFilePath, (err) => {
        if (err && err.code !== 'ENOENT') console.error("Error deleting old profile picture:", err);
      });
    }

    user.profilePicture = req.file.filename;
    await user.save();

    await reviewModel.updateMany(
      { userId: user._id.toString() },
      { userAvatar: user.profilePicture }
    );

    res.status(200).json({ 
      success: true, 
      message: "Profile picture updated successfully",
      data: { profilePicture: user.profilePicture }
    });
  } catch (error) {
    console.log(error);
    if (req.file) {
      fs.unlink(`uploads/${req.file.filename}`, () => {});
    }
    res.status(500).json({ success: false, message: "Error uploading profile picture" });
  }
};

// Delete profile picture
const deleteProfilePicture = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.profilePicture) {
      return res.status(400).json({ success: false, message: "No profile picture to delete" });
    }

    // Delete file from filesystem
    const filePath = path.join("uploads", path.basename(user.profilePicture));
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error("Error deleting profile picture:", err);
      }
    });

    user.profilePicture = '';
    await user.save();

    // Update reviews to remove avatar
    await reviewModel.updateMany(
      { userId: user._id.toString() },
      { $unset: { userAvatar: "" } }
    );

    res.status(200).json({ 
      success: true, 
      message: "Profile picture deleted successfully",
      data: { profilePicture: '' }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting profile picture" });
  }
};

// Delete user account
const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.body.userId;

    if (!password) {
      return res.status(400).json({ success: false, message: "Password is required to delete account" });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Incorrect password" });
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
        message: `Cannot delete account with ${activeOrders} active order(s). Please cancel or complete orders first.` 
      });
    }

    // Delete profile picture if exists
    if (user.profilePicture) {
      const filePath = path.join("uploads", path.basename(user.profilePicture));
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error("Error deleting profile picture:", err);
        }
      });
    }

    // Delete user account
    await userModel.findByIdAndDelete(userId);

    res.status(200).json({ 
      success: true, 
      message: "Account deleted successfully" 
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting account" });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error changing password" });
  }
};

export { getProfile, updateProfile, uploadProfilePicture, deleteProfilePicture, changePassword, deleteAccount };

