import userModel from "../models/userModel.js";
import PasswordResetToken from "../models/passwordResetTokenModel.js";
import CSRFToken from "../models/csrfTokenModel.js";
import { 
  generateSecureToken, 
  hashToken,
  validatePasswordStrength,
  revokeAllUserTokens
} from "../utils/authUtils.js";
import { sendPasswordResetEmail } from "../utils/emailService.js";
import bcrypt from "bcrypt";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { send2FASetupEmail } from "../utils/emailService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { writeAudit } from "../services/auditService.js";

// Request password reset
const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      // Don't reveal if email exists (security best practice)
      return sendSuccess(res, req, 200, { 
        success: true, 
        message: "If the email exists, a password reset link has been sent." 
      });
    }

    // Generate reset token
    const resetToken = generateSecureToken(32);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    // Store reset token
    await PasswordResetToken.create({
      userId: user._id,
      token: hashToken(resetToken),
      expiresAt,
      ipAddress,
      userAgent
    });

    // Send reset email
    await sendPasswordResetEmail(user.email, resetToken);

    await writeAudit(req, {
      userId: user._id,
      action: "auth.password_reset_request",
      resourceType: "user",
      resourceId: String(user._id),
    });

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "If the email exists, a password reset link has been sent." 
    });
  } catch (error) {
    console.error("Password reset error:", error);
    sendError(res, req, 500, "Error processing password reset request");
  }
};

// Reset password with token
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  
  try {
    if (!token || !newPassword) {
      return sendError(res, req, 400, "Token and new password are required");
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return sendError(res, req, 400, "Password does not meet requirements", {
        errors: passwordValidation.errors,
      });
    }

    // Find reset token
    const hashedToken = hashToken(token);
    const resetTokenRecord = await PasswordResetToken.findOne({
      token: hashedToken,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!resetTokenRecord) {
      return sendError(res, req, 400, "Invalid or expired reset token");
    }

    // Get user
    const user = await userModel.findById(resetTokenRecord.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Hash new password
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    user.passwordResetRequired = false;
    await user.save();

    // Mark token as used
    resetTokenRecord.used = true;
    await resetTokenRecord.save();

    // Revoke all existing sessions (force re-login)
    await revokeAllUserTokens(user._id);

    await writeAudit(req, {
      userId: user._id,
      action: "auth.password_reset_complete",
      resourceType: "user",
      resourceId: String(user._id),
    });

    sendSuccess(res, req, 200, { success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Password reset error:", error);
    sendError(res, req, 500, "Error resetting password");
  }
};

// Generate CSRF token
const generateCSRFToken = async (req, res) => {
  const userId = req.body.userId;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    if (!userId) {
      return sendError(res, req, 401, "Authentication required");
    }

    // Generate CSRF token
    const csrfToken = generateSecureToken(32);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    // Store CSRF token
    await CSRFToken.create({
      userId,
      token: hashToken(csrfToken),
      expiresAt,
      ipAddress,
      userAgent
    });

    sendSuccess(res, req, 200, { 
      success: true, 
      csrfToken,
      expiresAt 
    });
  } catch (error) {
    console.error("CSRF token generation error:", error);
    sendError(res, req, 500, "Error generating CSRF token");
  }
};

// Setup 2FA
const setup2FA = async (req, res) => {
  const userId = req.body.userId;
  
  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Food Delivery (${user.email})`,
      issuer: 'Food Delivery App'
    });

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () => generateSecureToken(8).toUpperCase());

    // Store secret and backup codes (temporarily, until verified)
    user.twoFactorSecret = secret.base32;
    user.twoFactorBackupCodes = backupCodes;
    await user.save();

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    sendSuccess(res, req, 200, {
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes,
      message: "Scan the QR code with your authenticator app and verify with a code"
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    sendError(res, req, 500, "Error setting up 2FA");
  }
};

// Verify and enable 2FA
const verify2FA = async (req, res) => {
  const userId = req.body.userId;
  const { code } = req.body;
  
  try {
    const user = await userModel.findById(userId);
    if (!user || !user.twoFactorSecret) {
      return sendError(res, req, 400, "2FA setup not initiated");
    }

    // Verify code
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return sendError(res, req, 400, "Invalid verification code");
    }

    // Enable 2FA
    user.twoFactorEnabled = true;
    await user.save();

    // Send backup codes email
    await send2FASetupEmail(user.email, user.twoFactorBackupCodes);

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Two-factor authentication enabled successfully",
      backupCodes: user.twoFactorBackupCodes
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    sendError(res, req, 500, "Error verifying 2FA");
  }
};

// Disable 2FA
const disable2FA = async (req, res) => {
  const userId = req.body.userId;
  const { password } = req.body;
  
  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, req, 401, "Invalid password");
    }

    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    await user.save();

    sendSuccess(res, req, 200, { success: true, message: "Two-factor authentication disabled" });
  } catch (error) {
    console.error("2FA disable error:", error);
    sendError(res, req, 500, "Error disabling 2FA");
  }
};

// Create new admin (limited to 2 admins total)
const createAdmin = async (req, res) => {
  const { name, email, password } = req.body;
  const currentUserId = req.body.userId;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    // Check if current user is admin
    const currentUser = await userModel.findById(currentUserId);
    if (!currentUser || currentUser.role !== 'admin') {
      return sendError(res, req, 403, "Only admins can create new admins");
    }

    // Check current admin count
    const adminCount = await userModel.countDocuments({ role: 'admin' });
    if (adminCount >= 2) {
      return sendError(
        res,
        req,
        400,
        "Maximum limit of 2 admins reached. Cannot create more admin accounts."
      );
    }

    // Validate input
    if (!name || !email || !password) {
      return sendError(res, req, 400, "Name, email, and password are required");
    }

    // Check if user already exists
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return sendError(res, req, 409, "User with this email already exists");
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return sendError(res, req, 400, "Password does not meet requirements", {
        errors: passwordValidation.errors,
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new admin
    const newAdmin = new userModel({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'admin',
      passwordChangedAt: new Date(),
      createdBy: currentUserId,
      ipAddress,
      userAgent
    });

    await newAdmin.save();

    // Log admin creation activity
    console.log(`New admin created: ${email} by ${currentUser.email} from IP: ${ipAddress}`);

    sendSuccess(res, req, 201, { 
      success: true, 
      message: `Admin account created successfully for ${email}`,
      adminCount: adminCount + 1,
      maxAdmins: 2
    });
  } catch (error) {
    console.error("Admin creation error:", error);
    sendError(res, req, 500, "Error creating admin account");
  }
};

// Get admin count and list (for current admin only)
const getAdminInfo = async (req, res) => {
  const currentUserId = req.body.userId;
  
  try {
    // Check if current user is admin
    const currentUser = await userModel.findById(currentUserId);
    if (!currentUser || currentUser.role !== 'admin') {
      return sendError(res, req, 403, "Access denied");
    }

    // Get admin count and list
    const admins = await userModel.find({ role: 'admin' })
      .select('name email createdAt lastLoginAt isBlocked')
      .sort({ createdAt: 1 });

    const adminCount = admins.length;
    const canCreateMore = adminCount < 2;

    sendSuccess(res, req, 200, { 
      success: true, 
      adminCount,
      maxAdmins: 2,
      canCreateMore,
      admins: admins.map(admin => ({
        id: admin._id,
        name: admin.name,
        email: admin.email,
        createdAt: admin.createdAt,
        lastLoginAt: admin.lastLoginAt,
        isBlocked: admin.isBlocked,
        isCurrentUser: admin._id.toString() === currentUserId
      }))
    });
  } catch (error) {
    console.error("Get admin info error:", error);
    sendError(res, req, 500, "Error fetching admin information");
  }
};

export { 
  requestPasswordReset, 
  resetPassword, 
  generateCSRFToken,
  setup2FA,
  verify2FA,
  disable2FA,
  createAdmin,
  getAdminInfo
};

