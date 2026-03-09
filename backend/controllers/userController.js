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

// Login user with enhanced security
const loginUser = async (req, res) => {
  const { email, password, twoFactorCode } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User Doesn't exist" });
    }

    // Check if account is locked
    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      return res.status(423).json({ success: false, message: lockStatus.message });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attemptResult = await handleFailedLogin(user, 5, 30);
      return res.status(401).json({ 
        success: false, 
        message: attemptResult.locked ? attemptResult.message : "Invalid Credentials",
        remainingAttempts: attemptResult.remainingAttempts
      });
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(200).json({ 
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
        return res.status(401).json({ 
          success: false, 
          message: "Invalid two-factor authentication code",
          remainingAttempts: attemptResult.remainingAttempts
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
    res.status(200).json({ 
      success: true, 
      accessToken, 
      refreshToken,
      token: accessToken, // Backward compatibility
      role,
      twoFactorEnabled: user.twoFactorEnabled
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Refresh access token
const refreshAccessToken = async (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  
  try {
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Check if token exists in database and is not revoked
    const storedToken = await getRefreshToken(refreshToken);
    if (!storedToken) {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }

    // Check if user still exists and is not blocked
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: "Account is blocked" });
    }

    // Generate new access token
    const newAccessToken = createAccessToken(user._id);

    res.status(200).json({ 
      success: true, 
      accessToken: newAccessToken,
      token: newAccessToken // Backward compatibility
    });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message || "Invalid refresh token" });
  }
};

// Register user with password strength validation
const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  
  try {
    // Check if user already exists
    const exists = await userModel.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        success: false, 
        message: "Password does not meet requirements",
        errors: passwordValidation.errors
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new userModel({
      name: name,
      email: email,
      password: hashedPassword,
      passwordChangedAt: new Date()
    });

    const user = await newUser.save();
    
    // Generate tokens
    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    // Store refresh token
    await storeRefreshToken(user._id, refreshToken, ipAddress, userAgent);

    const role = user.role;
    res.status(201).json({ 
      success: true, 
      accessToken,
      refreshToken,
      token: accessToken, // Backward compatibility
      role 
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error" });
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

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error during logout" });
  }
};

export { loginUser, registerUser, refreshAccessToken, logoutUser };
