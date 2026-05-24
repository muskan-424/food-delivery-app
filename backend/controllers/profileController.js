import userModel from "../models/userModel.js";
import reviewModel from "../models/reviewModel.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import validator from "validator";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { createSignedPutUrl, getMediaPublicUrl } from "../utils/mediaStorage.js";
import { normalizeUploadedMediaKey } from "../utils/mediaKeyValidation.js";

function withProfilePictureUrl(userDoc) {
  const data = userDoc?.toObject ? userDoc.toObject() : { ...(userDoc || {}) };
  data.profilePictureUrl = getMediaPublicUrl(data.profilePicture);
  return data;
}

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).select('-password');
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    
    // User always sees their own full data (decryption handled by model hooks)
    sendSuccess(res, req, 200, { success: true, data: withProfilePictureUrl(user) });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching profile");
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
        return sendError(res, req, 400, "Invalid phone number");
      }
      updateData.phone = phone.trim();
    }

    const user = await userModel.findByIdAndUpdate(
      req.body.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    if (updateData.name) {
      await reviewModel.updateMany(
        { userId: user._id.toString() },
        { userName: user.name }
      );
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Profile updated successfully",
      data: withProfilePictureUrl(user)
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating profile");
  }
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, req, 400, "Image file is required");
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      // Delete uploaded file if user not found
      fs.unlink(`uploads/${req.file.filename}`, () => {});
      return sendError(res, req, 404, "User not found");
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

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Profile picture updated successfully",
      data: {
        profilePicture: user.profilePicture,
        profilePictureUrl: getMediaPublicUrl(user.profilePicture),
      }
    });
  } catch (error) {
    console.log(error);
    if (req.file) {
      fs.unlink(`uploads/${req.file.filename}`, () => {});
    }
    sendError(res, req, 500, "Error uploading profile picture");
  }
};

// Delete profile picture
const deleteProfilePicture = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    if (!user.profilePicture) {
      return sendError(res, req, 400, "No profile picture to delete");
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

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Profile picture deleted successfully",
      data: { profilePicture: '', profilePictureUrl: null }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error deleting profile picture");
  }
};

// Delete user account
const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.body.userId;

    if (!password) {
      return sendError(res, req, 400, "Password is required to delete account");
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, req, 401, "Incorrect password");
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
        `Cannot delete account with ${activeOrders} active order(s). Please cancel or complete orders first.`
      );
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

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Account deleted successfully" 
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error deleting account");
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, req, 400, "Current password and new password are required");
    }

    if (newPassword.length < 8) {
      return sendError(res, req, 400, "New password must be at least 8 characters");
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendError(res, req, 401, "Current password is incorrect");
    }

    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    sendSuccess(res, req, 200, { success: true, message: "Password changed successfully" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error changing password");
  }
};

const listPushDevices = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).select("pushDevices");
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    sendSuccess(res, req, 200, {
      success: true,
      data: (user.pushDevices || []).map((d) => ({
        token: d.token,
        platform: d.platform || "unknown",
        active: d.active !== false,
        lastSeenAt: d.lastSeenAt || null,
      })),
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error loading push devices");
  }
};

const registerPushDevice = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const platformRaw = String(req.body.platform || "unknown").toLowerCase();
    const platform = ["android", "ios", "web"].includes(platformRaw) ? platformRaw : "unknown";
    if (!token || token.length < 16 || token.length > 4096) {
      return sendError(res, req, 400, "token is required (16-4096 chars)");
    }
    const user = await userModel.findById(req.body.userId).select("pushDevices");
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    const now = new Date();
    const devices = Array.isArray(user.pushDevices) ? user.pushDevices : [];
    const idx = devices.findIndex((d) => String(d.token) === token);
    if (idx >= 0) {
      devices[idx].platform = platform;
      devices[idx].active = true;
      devices[idx].lastSeenAt = now;
    } else {
      devices.push({ token, platform, active: true, lastSeenAt: now });
    }
    user.pushDevices = devices.slice(-20);
    await user.save();
    sendSuccess(res, req, 200, {
      success: true,
      message: "Push device registered",
      data: { token, platform, active: true, lastSeenAt: now },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error registering push device");
  }
};

// Phase 9: object-storage ready upload URL for profile picture
const createProfilePictureUploadUrl = async (req, res) => {
  try {
    const extRaw = String(req.body.ext || req.query.ext || "jpg")
      .trim()
      .toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(extRaw) ? extRaw : "jpg";
    const contentTypeRaw = String(req.body.contentType || req.query.contentType || "image/jpeg")
      .trim()
      .toLowerCase();
    const allowedContentTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ]);
    const contentType = allowedContentTypes.has(contentTypeRaw)
      ? contentTypeRaw
      : "image/jpeg";

    const key = `profile_${String(req.body.userId)}_${Date.now()}.${safeExt}`;
    const uploadUrl = await createSignedPutUrl({ key, contentType });
    if (!uploadUrl) {
      return sendError(
        res,
        req,
        400,
        "Signed upload URL unavailable (object storage provider not configured)"
      );
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        key,
        uploadUrl,
        publicUrl: getMediaPublicUrl(key),
        contentType,
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error creating upload URL");
  }
};

// Phase 9: finalize direct-uploaded profile picture key
const finalizeProfilePictureUpload = async (req, res) => {
  try {
    const key = normalizeUploadedMediaKey(req.body.key);
    if (!key) {
      return sendError(res, req, 400, "Valid key is required");
    }
    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    user.profilePicture = key;
    await user.save();
    await reviewModel.updateMany(
      { userId: user._id.toString() },
      { userAvatar: user.profilePicture }
    );
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Profile picture key finalized",
      data: {
        profilePicture: user.profilePicture,
        profilePictureUrl: getMediaPublicUrl(user.profilePicture),
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error finalizing profile picture key");
  }
};

const unregisterPushDevice = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    if (!token) {
      return sendError(res, req, 400, "token is required");
    }
    const user = await userModel.findById(req.body.userId).select("pushDevices");
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    const before = user.pushDevices?.length || 0;
    user.pushDevices = (user.pushDevices || []).filter((d) => String(d.token) !== token);
    const removed = before - (user.pushDevices?.length || 0);
    await user.save();
    sendSuccess(res, req, 200, {
      success: true,
      message: removed > 0 ? "Push device removed" : "Push device not found",
      data: { removed },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error unregistering push device");
  }
};

export {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  changePassword,
  deleteAccount,
  listPushDevices,
  registerPushDevice,
  unregisterPushDevice,
  createProfilePictureUploadUrl,
  finalizeProfilePictureUpload,
};

