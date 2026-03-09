import userModel from "../models/userModel.js";
import foodModel from "../models/foodModel.js";

// Get wishlist
const getWishlist = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).populate({
      path: 'wishlist',
      model: 'food'
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Filter out null items (in case food was deleted)
    const validWishlist = (user.wishlist || []).filter(item => item !== null);

    res.status(200).json({ 
      success: true, 
      data: validWishlist
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching wishlist" });
  }
};

// Add to wishlist
const addToWishlist = async (req, res) => {
  try {
    const { foodId } = req.body;

    if (!foodId) {
      return res.status(400).json({ success: false, message: "Food ID is required" });
    }

    // Verify food exists
    const food = await foodModel.findById(foodId);
    if (!food) {
      return res.status(404).json({ success: false, message: "Food item not found" });
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if already in wishlist
    if (user.wishlist.includes(foodId)) {
      return res.status(409).json({ success: false, message: "Item already in wishlist" });
    }

    user.wishlist.push(foodId);
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "Item added to wishlist",
      data: { foodId }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error adding to wishlist" });
  }
};

// Remove from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const { foodId } = req.params;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const index = user.wishlist.indexOf(foodId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Item not in wishlist" });
    }

    user.wishlist.splice(index, 1);
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "Item removed from wishlist"
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error removing from wishlist" });
  }
};

// Check if item is in wishlist
const checkWishlist = async (req, res) => {
  try {
    const { foodId } = req.params;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isInWishlist = user.wishlist.includes(foodId);

    res.status(200).json({ 
      success: true, 
      data: { isInWishlist }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error checking wishlist" });
  }
};

export { getWishlist, addToWishlist, removeFromWishlist, checkWishlist };

