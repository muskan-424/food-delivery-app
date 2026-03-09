import userModel from "../models/userModel.js";

// Admin authorization middleware - checks role before processing
const adminMiddleware = async (req, res, next) => {
  try {
    const userData = await userModel.findById(req.body.userId);
    if (userData && userData.role === "admin") {
      next();
    } else {
      return res.status(403).json({ 
        success: false, 
        message: "Admin access required" 
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ 
      success: false, 
      message: "Error checking admin access" 
    });
  }
};

export default adminMiddleware;

