import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import TokenBlacklist from "../models/tokenBlacklistModel.js";
import { verifyAccessToken } from "../utils/authUtils.js";
import { verifyTokenWithRotation } from "../utils/jwtRotation.js";

const authMiddleware = async (req, res, next) => {
  const { token } = req.headers;
  if (!token) {
    return res.status(401).json({ success: false, message: "Not Authorized Login Again" });
  }
  try {
    // Check if token is blacklisted
    const blacklisted = await TokenBlacklist.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({ success: false, message: "Token has been revoked" });
    }

    // Verify token (supports both old and new token format, and rotation)
    let token_decode;
    try {
      token_decode = verifyAccessToken(token);
    } catch (error) {
      try {
        // Try old token format for backward compatibility
        token_decode = jwt.verify(token, process.env.JWT_SECRET);
      } catch (oldError) {
        try {
          // Try with rotation support (previous secret)
          const result = verifyTokenWithRotation(token, 'access');
          token_decode = result.decoded;
        } catch (rotationError) {
          throw new Error('Invalid or expired token');
        }
      }
    }
    
    req.body.userId = token_decode.id;
    
    // Fetch user and check if blocked
    const user = await userModel.findById(token_decode.id);
    if (user) {
      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({ 
          success: false, 
          message: `Your account has been blocked. Reason: ${user.blockReason || 'Contact support for more information'}` 
        });
      }
      
      req.body.role = user.role;
      
      // Update last login time if this is a login request
      if (req.path.includes('/login')) {
        user.lastLoginAt = new Date();
        await user.save();
      }
    } else {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
export default authMiddleware;
