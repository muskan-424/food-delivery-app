import userModel from "../models/userModel.js";
import foodModel from "../models/foodModel.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

// Get wishlist
const getWishlist = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).populate({
      path: 'wishlist',
      model: 'food'
    });
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Filter out null items (in case food was deleted)
    const validWishlist = (user.wishlist || []).filter(item => item !== null);

    sendSuccess(res, req, 200, { 
      success: true, 
      data: validWishlist
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching wishlist");
  }
};

// Add to wishlist
const addToWishlist = async (req, res) => {
  try {
    const { foodId } = req.body;

    if (!foodId) {
      return sendError(res, req, 400, "Food ID is required");
    }

    // Verify food exists
    const food = await foodModel.findById(foodId);
    if (!food) {
      return sendError(res, req, 404, "Food item not found");
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Check if already in wishlist
    if (user.wishlist.includes(foodId)) {
      return sendError(res, req, 409, "Item already in wishlist");
    }

    user.wishlist.push(foodId);
    await user.save();

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Item added to wishlist",
      data: { foodId }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error adding to wishlist");
  }
};

// Remove from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const { foodId } = req.params;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    const index = user.wishlist.indexOf(foodId);
    if (index === -1) {
      return sendError(res, req, 404, "Item not in wishlist");
    }

    user.wishlist.splice(index, 1);
    await user.save();

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Item removed from wishlist"
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error removing from wishlist");
  }
};

// Check if item is in wishlist
const checkWishlist = async (req, res) => {
  try {
    const { foodId } = req.params;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    const isInWishlist = user.wishlist.includes(foodId);

    sendSuccess(res, req, 200, { 
      success: true, 
      data: { isInWishlist }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error checking wishlist");
  }
};

export { getWishlist, addToWishlist, removeFromWishlist, checkWishlist };

