import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import { verifyAccessToken } from "../utils/authUtils.js";

/** Sets req.body.userId when a valid token is present; otherwise continues anonymously. */
const optionalAuthMiddleware = async (req, res, next) => {
  const { token } = req.headers;
  if (!token) return next();
  try {
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    }
    const user = await userModel.findById(decoded.id).select("_id isBlocked role");
    if (user && !user.isBlocked) {
      req.body.userId = String(user._id);
      req.body.role = user.role;
    }
  } catch {
    /* anonymous feedback allowed */
  }
  return next();
};

export default optionalAuthMiddleware;
