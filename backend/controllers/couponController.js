import couponModel from "../models/couponModel.js";
import orderModel from "../models/orderModel.js";

// Get all active coupons
const getCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await couponModel.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now }
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching coupons" });
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
          offerId: coupon.offerId || null
        });
      }
    }

    res.status(200).json({ 
      success: true, 
      data: availableCoupons 
    });
  } catch (error) {
    console.error("Error fetching available coupons:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching available coupons" 
    });
  }
};

// Validate coupon
const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const userId = req.body.userId;

    if (!code || !orderAmount) {
      return res.status(400).json({ 
        success: false, 
        message: "Coupon code and order amount are required" 
      });
    }

    const coupon = await couponModel.findOne({ 
      code: code.toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return res.status(400).json({ success: false, message: "Coupon has expired" });
    }

    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order amount of $${coupon.minOrderAmount} required` 
      });
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }

    // Check user usage limit
    const userUsageCount = await orderModel.countDocuments({
      userId,
      couponCode: code.toUpperCase()
    });

    if (userUsageCount >= coupon.userUsageLimit) {
      return res.status(400).json({ 
        success: false, 
        message: "You have already used this coupon" 
      });
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

    res.status(200).json({
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
    res.status(500).json({ success: false, message: "Error validating coupon" });
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
      applicableTo
    } = req.body;

    if (!code || !discountType || !discountValue || !validFrom || !validUntil) {
      return res.status(400).json({ 
        success: false, 
        message: "Code, discount type, discount value, valid from, and valid until are required" 
      });
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
      applicableTo: applicableTo || { type: 'all', ids: [] }
    });

    await coupon.save();

    res.status(201).json({ 
      success: true, 
      message: "Coupon created successfully",
      data: coupon
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Coupon code already exists" });
    }
    console.log(error);
    res.status(500).json({ success: false, message: "Error creating coupon" });
  }
};

// Admin: Get all coupons
const getAllCoupons = async (req, res) => {
  try {
    const coupons = await couponModel.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching coupons" });
  }
};

// Admin: Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const updateData = req.body;

    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }

    const coupon = await couponModel.findByIdAndUpdate(
      couponId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: "Coupon updated successfully",
      data: coupon
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating coupon" });
  }
};

// Admin: Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;

    const coupon = await couponModel.findByIdAndDelete(couponId);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    res.status(200).json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting coupon" });
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

