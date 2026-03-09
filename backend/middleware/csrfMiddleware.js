import CSRFToken from "../models/csrfTokenModel.js";
import { hashToken } from "../utils/authUtils.js";

/**
 * CSRF Protection Middleware
 * Validates CSRF token for state-changing operations (POST, PUT, DELETE, PATCH)
 */
const csrfMiddleware = async (req, res, next) => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for certain endpoints (like login, register)
  const skipPaths = ['/api/user/login', '/api/user/register', '/api/auth/password-reset'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const userId = req.body.userId;
  if (!userId) {
    // If not authenticated, skip CSRF (auth middleware will handle it)
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] || req.body.csrfToken;
  
  if (!csrfToken) {
    return res.status(403).json({ 
      success: false, 
      message: "CSRF token is required" 
    });
  }

  try {
    const hashedToken = hashToken(csrfToken);
    const tokenRecord = await CSRFToken.findOne({
      userId,
      token: hashedToken,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenRecord) {
      return res.status(403).json({ 
        success: false, 
        message: "Invalid or expired CSRF token" 
      });
    }

    // Optionally delete token after use (one-time use)
    // await CSRFToken.deleteOne({ _id: tokenRecord._id });

    next();
  } catch (error) {
    console.error("CSRF validation error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error validating CSRF token" 
    });
  }
};

export default csrfMiddleware;

