import jwt from "jsonwebtoken";
import crypto from "crypto";
import RefreshToken from "../models/refreshTokenModel.js";

// Create access token (short-lived)
export const createAccessToken = (userId) => {
  return jwt.sign({ id: userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

// Create refresh token (long-lived)
export const createRefreshToken = (userId) => {
  return jwt.sign({ id: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Verify access token
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

// Verify refresh token
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

// Generate random token for password reset, CSRF, etc.
export const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Hash token for storage
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Validate password strength
export const validatePasswordStrength = (password) => {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Check if account is locked
export const isAccountLocked = (user) => {
  if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
    const minutesLeft = Math.ceil((user.accountLockedUntil - new Date()) / (1000 * 60));
    return {
      locked: true,
      message: `Account is locked. Please try again in ${minutesLeft} minute(s).`
    };
  }
  return { locked: false };
};

// Increment login attempts and lock account if needed
export const handleFailedLogin = async (user, maxAttempts = 5, lockoutDurationMinutes = 30) => {
  const now = new Date();
  const lastAttempt = user.lastLoginAttempt || now;
  
  // Reset attempts if last attempt was more than lockout duration ago
  if (now - lastAttempt > lockoutDurationMinutes * 60 * 1000) {
    user.loginAttempts = 1;
  } else {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
  }
  
  user.lastLoginAttempt = now;
  
  // Lock account if max attempts reached
  if (user.loginAttempts >= maxAttempts) {
    const lockUntil = new Date(now.getTime() + lockoutDurationMinutes * 60 * 1000);
    user.accountLockedUntil = lockUntil;
    await user.save();
    return {
      locked: true,
      attempts: user.loginAttempts,
      message: `Too many failed login attempts. Account locked for ${lockoutDurationMinutes} minutes.`
    };
  }
  
  await user.save();
  return {
    locked: false,
    attempts: user.loginAttempts,
    remainingAttempts: maxAttempts - user.loginAttempts
  };
};

// Reset login attempts on successful login
export const resetLoginAttempts = async (user) => {
  user.loginAttempts = 0;
  user.lastLoginAttempt = null;
  user.accountLockedUntil = null;
  await user.save();
};

// Store refresh token in database
export const storeRefreshToken = async (userId, token, ipAddress, userAgent) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
  
  const refreshToken = new RefreshToken({
    userId,
    token: hashToken(token), // Store hashed token
    expiresAt,
    ipAddress,
    userAgent
  });
  
  await refreshToken.save();
  return refreshToken;
};

// Verify and get refresh token from database
export const getRefreshToken = async (token) => {
  const hashedToken = hashToken(token);
  const refreshToken = await RefreshToken.findOne({
    token: hashedToken,
    revoked: false,
    expiresAt: { $gt: new Date() }
  });
  
  return refreshToken;
};

// Revoke refresh token
export const revokeRefreshToken = async (token) => {
  const hashedToken = hashToken(token);
  await RefreshToken.updateOne(
    { token: hashedToken },
    { 
      revoked: true,
      revokedAt: new Date()
    }
  );
};

// Revoke all refresh tokens for a user
export const revokeAllUserTokens = async (userId) => {
  await RefreshToken.updateMany(
    { userId, revoked: false },
    { 
      revoked: true,
      revokedAt: new Date()
    }
  );
};

