import userModel from "../models/userModel.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

// add items to user cart
const addToCart = async (req, res) => {
  try {
    let userData = await userModel.findById(req.body.userId);
    if (!userData) {
      return sendError(res, req, 404, "User not found");
    }
    
    let cartData = userData.cartData || {};
    if (!cartData[req.body.itemId]) {
      cartData[req.body.itemId] = 1;
    } else {
      cartData[req.body.itemId] += 1;
    }
    await userModel.findByIdAndUpdate(req.body.userId, { cartData });
    sendSuccess(res, req, 200, { success: true, message: "Added to Cart" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error adding to cart");
  }
};

// remove from cart
const removeFromCart = async (req, res) => {
  try {
    let userData = await userModel.findById(req.body.userId);
    if (!userData) {
      return sendError(res, req, 404, "User not found");
    }
    
    let cartData = userData.cartData || {};
    if (cartData[req.body.itemId] > 1) {
      cartData[req.body.itemId] -= 1;
    } else {
      delete cartData[req.body.itemId];
    }
    await userModel.findByIdAndUpdate(req.body.userId, { cartData });
    sendSuccess(res, req, 200, { success: true, message: "Removed from Cart" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error removing from cart");
  }
};

// fetch user cart data
const getCart = async (req, res) => {
  try {
    let userData = await userModel.findById(req.body.userId);
    if (!userData) {
      return sendError(res, req, 404, "User not found");
    }
    
    let cartData = userData.cartData || {};
    sendSuccess(res, req, 200, { success: true, cartData: cartData });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching cart data");
  }
};

export { addToCart, removeFromCart, getCart };
