import couponModel from "../models/couponModel.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import {
  normalizeSegmentTags,
  userMatchesCouponSegments,
} from "../services/segmentService.js";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

// Get all active coupons
const getCoupons = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const now = new Date();
    const query = {
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    };
    const [coupons, total] = await Promise.all([
      couponModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      couponModel.countDocuments(query),
    ]);

    sendSuccess(res, req, 200, {
      success: true,
      data: coupons,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching coupons");
  }
};

// Get available coupon codes for user (based on cart amount and eligibility)
const getAvailableCoupons = async (req, res) => {
  try {
    const { orderAmount } = req.query;
    const userId = req.body.userId || null;
    const cartAmount = orderAmount ? parseFloat(orderAmount) : 0;

    const now = new Date();
    
    // Get all active coupons
    const coupons = await couponModel.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      minOrderAmount: { $lte: cartAmount }
    }).sort({ createdAt: -1 });

    let userSegmentTags = [];
    if (userId) {
      const u = await userModel.findById(userId).select("segmentTags");
      userSegmentTags = u?.segmentTags || [];
    }

    // Filter coupons based on user eligibility
    const availableCoupons = [];
    
    for (const coupon of coupons) {
      let isEligible = true;

      // Check usage limits
      if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
        isEligible = false;
        continue;
      }

      // Check user usage limit
      if (userId && coupon.userUsageLimit) {
        const userUsageCount = await orderModel.countDocuments({
          userId,
          couponCode: coupon.code
        });
        if (userUsageCount >= coupon.userUsageLimit) {
          isEligible = false;
          continue;
        }
      }

      // Check minimum order amount
      if (cartAmount < coupon.minOrderAmount) {
        isEligible = false;
        continue;
      }

      if (!userMatchesCouponSegments(userSegmentTags, coupon)) {
        isEligible = false;
        continue;
      }

      if (isEligible) {
        // Calculate potential discount for display
        let potentialDiscount = 0;
        if (coupon.discountType === 'percentage') {
          potentialDiscount = (cartAmount * coupon.discountValue) / 100;
          if (coupon.maxDiscount && potentialDiscount > coupon.maxDiscount) {
            potentialDiscount = coupon.maxDiscount;
          }
        } else {
          potentialDiscount = coupon.discountValue;
          if (potentialDiscount > cartAmount) {
            potentialDiscount = cartAmount;
          }
        }

        availableCoupons.push({
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscount: coupon.maxDiscount,
          minOrderAmount: coupon.minOrderAmount,
          validUntil: coupon.validUntil,
          potentialDiscount: Math.round(potentialDiscount * 100) / 100,
          offerId: coupon.offerId || null,
          requiredSegmentTags: coupon.requiredSegmentTags || [],
        });
      }
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      data: availableCoupons 
    });
  } catch (error) {
    console.error("Error fetching available coupons:", error);
    sendError(res, req, 500, "Error fetching available coupons");
  }
};

// Validate coupon
const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const userId = req.body.userId;

    if (!code || !orderAmount) {
      return sendError(res, req, 400, "Coupon code and order amount are required");
    }

    const coupon = await couponModel.findOne({ 
      code: code.toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return sendError(res, req, 404, "Invalid coupon code");
    }

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return sendError(res, req, 400, "Coupon has expired");
    }

    if (orderAmount < coupon.minOrderAmount) {
      return sendError(
        res,
        req,
        400,
        `Minimum order amount of $${coupon.minOrderAmount} required`
      );
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return sendError(res, req, 400, "Coupon usage limit reached");
    }

    // Check user usage limit
    const userUsageCount = await orderModel.countDocuments({
      userId,
      couponCode: code.toUpperCase()
    });

    if (userUsageCount >= coupon.userUsageLimit) {
      return sendError(res, req, 400, "You have already used this coupon");
    }

    const user = await userModel.findById(userId).select("segmentTags");
    if (!userMatchesCouponSegments(user?.segmentTags, coupon)) {
      return sendError(res, req, 400, "This coupon is not available for your account");
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (orderAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.discountValue;
      if (discount > orderAmount) {
        discount = orderAmount;
      }
    }

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue
        },
        discount: Math.round(discount * 100) / 100,
        finalAmount: Math.round((orderAmount - discount) * 100) / 100
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error validating coupon");
  }
};

// Admin: Create coupon
const createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
      userUsageLimit,
      applicableTo,
      requiredSegmentTags,
    } = req.body;

    if (!code || !discountType || !discountValue || !validFrom || !validUntil) {
      return sendError(
        res,
        req,
        400,
        "Code, discount type, discount value, valid from, and valid until are required"
      );
    }

    const coupon = new couponModel({
      code: code.toUpperCase(),
      description: description || '',
      discountType,
      discountValue,
      minOrderAmount: minOrderAmount || 0,
      maxDiscount: maxDiscount || null,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      usageLimit: usageLimit || null,
      userUsageLimit: userUsageLimit || 1,
      applicableTo: applicableTo || { type: 'all', ids: [] },
      requiredSegmentTags: normalizeSegmentTags(requiredSegmentTags),
    });

    await coupon.save();

    sendSuccess(res, req, 201, { 
      success: true, 
      message: "Coupon created successfully",
      data: coupon
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, req, 409, "Coupon code already exists");
    }
    console.log(error);
    sendError(res, req, 500, "Error creating coupon");
  }
};

// Admin: Get all coupons
const getAllCoupons = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const [coupons, total] = await Promise.all([
      couponModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      couponModel.countDocuments(),
    ]);
    sendSuccess(res, req, 200, {
      success: true,
      data: coupons,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching coupons");
  }
};

// Admin: Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const updateData = { ...req.body };

    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    if (updateData.requiredSegmentTags !== undefined) {
      updateData.requiredSegmentTags = normalizeSegmentTags(updateData.requiredSegmentTags);
    }

    const coupon = await couponModel.findByIdAndUpdate(
      couponId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return sendError(res, req, 404, "Coupon not found");
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Coupon updated successfully",
      data: coupon
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating coupon");
  }
};

// Admin: Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;

    const coupon = await couponModel.findByIdAndDelete(couponId);
    if (!coupon) {
      return sendError(res, req, 404, "Coupon not found");
    }

    sendSuccess(res, req, 200, { success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error deleting coupon");
  }
};

export { 
  getCoupons, 
  getAvailableCoupons,
  validateCoupon, 
  createCoupon, 
  getAllCoupons, 
  updateCoupon, 
  deleteCoupon 
};

