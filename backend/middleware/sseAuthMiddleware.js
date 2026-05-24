import userModel from "../models/userModel.js";
import { verifyAccessToken } from "../utils/authUtils.js";

/**
 * EventSource cannot set headers; pass JWT as ?token= or ?access_token=
 */
const sseAuthMiddleware = async (req, res, next) => {
  const sendJson = (status, body) => {
    res.status(status).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };

  try {
    const token = req.query.token || req.query.access_token;
    if (!token) {
      return sendJson(401, { success: false, message: "token query parameter required" });
    }

    const decoded = verifyAccessToken(token);
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return sendJson(401, { success: false, message: "User not found" });
    }
    if (user.isBlocked) {
      return sendJson(403, { success: false, message: "Account blocked" });
    }

    req.userId = String(user._id);
    next();
  } catch {
    return sendJson(401, { success: false, message: "Invalid or expired token" });
  }
};

export default sseAuthMiddleware;
