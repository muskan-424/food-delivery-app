import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import validator from "validator";
import { 
  createAccessToken, 
  createRefreshToken, 
  verifyRefreshToken,
  validatePasswordStrength,
  isAccountLocked,
  handleFailedLogin,
  resetLoginAttempts,
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} from "../utils/authUtils.js";
import TokenBlacklist from "../models/tokenBlacklistModel.js";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import {
  ensureReferralCodeForUser,
  findReferrerByCode,
} from "../services/referralService.js";
import {
  extendLoyaltyBalanceExpiry,
  previewLoyaltyRedemption,
} from "../services/loyaltyService.js";
import { assignExperimentForUser } from "../services/abTestingService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { writeAudit } from "../services/auditService.js";

// Login user with enhanced security
const loginUser = async (req, res) => {
  const { email, password, twoFactorCode } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return sendError(res, req, 404, "User Doesn't exist");
    }

    // Check if account is locked
    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      return sendError(res, req, 423, lockStatus.message);
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attemptResult = await handleFailedLogin(user, 5, 30);
      return sendError(
        res,
        req,
        401,
        attemptResult.locked ? attemptResult.message : "Invalid Credentials",
        { remainingAttempts: attemptResult.remainingAttempts }
      );
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return sendSuccess(res, req, 200, { 
          success: false, 
          requires2FA: true, 
          message: "Two-factor authentication code required" 
        });
      }

      // Verify 2FA code
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2 // Allow 2 time steps (60 seconds) of tolerance
      });

      // Check backup codes if TOTP fails
      if (!verified && user.twoFactorBackupCodes && user.twoFactorBackupCodes.includes(twoFactorCode)) {
        // Remove used backup code
        user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter(code => code !== twoFactorCode);
        await user.save();
      } else if (!verified) {
        const attemptResult = await handleFailedLogin(user, 5, 30);
        return sendError(res, req, 401, "Invalid two-factor authentication code", {
          remainingAttempts: attemptResult.remainingAttempts,
        });
      }
    }

    // Reset login attempts on successful login
    await resetLoginAttempts(user);

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    // Store refresh token
    await storeRefreshToken(user._id, refreshToken, ipAddress, userAgent);

    const role = user.role;
    await writeAudit(req, {
      userId: user._id,
      action: "auth.login",
      resourceType: "user",
      resourceId: String(user._id),
    });
    sendSuccess(res, req, 200, { 
      success: true, 
      accessToken, 
      refreshToken,
      token: accessToken, // Backward compatibility
      role,
      twoFactorEnabled: user.twoFactorEnabled
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Internal server error");
  }
};

// Refresh access token
const refreshAccessToken = async (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  
  try {
    if (!refreshToken) {
      return sendError(res, req, 400, "Refresh token is required");
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Check if token exists in database and is not revoked
    const storedToken = await getRefreshToken(refreshToken);
    if (!storedToken) {
      return sendError(res, req, 401, "Invalid or expired refresh token");
    }

    // Check if user still exists and is not blocked
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
    if (user.isBlocked) {
      return sendError(res, req, 403, "Account is blocked");
    }

    // Generate new access token
    const newAccessToken = createAccessToken(user._id);

    sendSuccess(res, req, 200, { 
      success: true, 
      accessToken: newAccessToken,
      token: newAccessToken // Backward compatibility
    });
  } catch (error) {
    sendError(res, req, 401, error.message || "Invalid refresh token");
  }
};

// Register user with password strength validation
const registerUser = async (req, res) => {
  const { name, email, password, referralCode: referralCodeInput } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    // Check if user already exists
    const exists = await userModel.findOne({ email });
    if (exists) {
      return sendError(res, req, 409, "User already exists");
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return sendError(res, req, 400, "Password does not meet requirements", {
        errors: passwordValidation.errors,
      });
    }

    let referredBy = null;
    if (referralCodeInput && String(referralCodeInput).trim()) {
      const ref = await findReferrerByCode(String(referralCodeInput));
      if (ref) {
        referredBy = ref._id;
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new userModel({
      name: name,
      email: email,
      password: hashedPassword,
      passwordChangedAt: new Date(),
      referredBy: referredBy || undefined,
    });

    let user = await newUser.save();

    await ensureReferralCodeForUser(user);

    if (referredBy) {
      const bonusReferrer = Number(process.env.LOYALTY_REFERRAL_REFERRER);
      const bonusReferee = Number(process.env.LOYALTY_REFERRAL_REFEREE);
      const refPts = Number.isFinite(bonusReferrer) && bonusReferrer >= 0 ? bonusReferrer : 100;
      const newPts = Number.isFinite(bonusReferee) && bonusReferee >= 0 ? bonusReferee : 50;
      await userModel.updateOne({ _id: referredBy }, { $inc: { loyaltyPoints: refPts } });
      await userModel.updateOne({ _id: user._id }, { $inc: { loyaltyPoints: newPts } });
      await extendLoyaltyBalanceExpiry(referredBy);
      await extendLoyaltyBalanceExpiry(user._id);
    }
    
    // Generate tokens
    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    // Store refresh token
    await storeRefreshToken(user._id, refreshToken, ipAddress, userAgent);

    const role = user.role;
    await writeAudit(req, {
      userId: user._id,
      action: "auth.register",
      resourceType: "user",
      resourceId: String(user._id),
    });
    sendSuccess(res, req, 201, { 
      success: true, 
      accessToken,
      refreshToken,
      token: accessToken, // Backward compatibility
      role 
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Internal server error");
  }
};

// Logout user (revoke tokens)
const logoutUser = async (req, res) => {
  const { refreshToken } = req.body;
  const accessToken = req.headers.token;
  const userId = req.body.userId;
  
  try {
    // Add access token to blacklist
    if (accessToken) {
      try {
        const jwt = await import("jsonwebtoken");
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        const expiresAt = new Date(decoded.exp * 1000);
        
        await TokenBlacklist.create({
          token: accessToken,
          userId: decoded.id,
          expiresAt,
          reason: 'logout'
        });
      } catch (error) {
        // Token might be invalid, continue anyway
      }
    }

    // Revoke refresh token
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    } else if (userId) {
      // Revoke all tokens for user
      await revokeAllUserTokens(userId);
    }

    sendSuccess(res, req, 200, { success: true, message: "Logged out successfully" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error during logout");
  }
};

const getGrowthSummary = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "Unauthorized");
    }

    let user = await userModel
      .findById(userId)
      .select(
        "referralCode loyaltyPoints referredBy segmentTags loyaltyBalanceExpiresAt"
      );
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    await ensureReferralCodeForUser(user);
    user = await userModel
      .findById(userId)
      .select(
        "referralCode loyaltyPoints referredBy segmentTags loyaltyBalanceExpiresAt"
      );

    const referralsCount = await userModel.countDocuments({ referredBy: userId });

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        referralCode: user.referralCode,
        loyaltyPoints: user.loyaltyPoints ?? 0,
        referralsCount,
        referredBy: user.referredBy,
        segmentTags: user.segmentTags || [],
        loyaltyBalanceExpiresAt: user.loyaltyBalanceExpiresAt || null,
      },
    });
  } catch (error) {
    console.error("getGrowthSummary:", error);
    sendError(res, req, 500, "Error loading growth data");
  }
};

const previewLoyalty = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "Unauthorized");
    }
    const baseTotalInr = Number(req.query.baseTotalInr ?? req.body.baseTotalInr ?? 0);
    const pointsRequested = Number(
      req.query.pointsRequested ?? req.body.pointsRequested ?? 0
    );
    const data = await previewLoyaltyRedemption(userId, pointsRequested, baseTotalInr);
    sendSuccess(res, req, 200, { success: true, data });
  } catch (error) {
    console.error("previewLoyalty:", error);
    sendError(res, req, 500, "Error previewing loyalty redemption");
  }
};

const getExperimentAssignment = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "Unauthorized");
    }
    const { experimentKey } = req.params;
    const user = await userModel.findById(userId).select("segmentTags");
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }
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
            variant: null,
            eligible: false,
          },
        });
      }
      return sendError(res, req, 400, "Invalid experiment request");
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: { ...result.data, eligible: true },
    });
  } catch (error) {
    console.error("getExperimentAssignment:", error);
    return sendError(res, req, 500, "Error resolving experiment assignment");
  }
};

export {
  loginUser,
  registerUser,
  refreshAccessToken,
  logoutUser,
  getGrowthSummary,
  previewLoyalty,
  getExperimentAssignment,
};
