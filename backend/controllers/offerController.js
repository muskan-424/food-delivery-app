import offerModel from "../models/offerModel.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import couponModel from "../models/couponModel.js";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

// Get all active offers for users
const getActiveOffers = async (req, res) => {
  try {
    const now = new Date();
    const userId = req.body.userId || null;
    const { page, limit, skip } = getPaginationParams(req.query);

    const offers = await offerModel
      .find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now }
      })
      .sort({ priority: -1, createdAt: -1 });

    // Filter offers based on user eligibility
    const eligibleOffers = [];
    
    for (const offer of offers) {
      let isEligible = true;

      // Check usage limits
      if (offer.usageLimit && offer.usageCount >= offer.usageLimit) {
        isEligible = false;
        continue;
      }

      // Check user-specific eligibility
      if (userId && offer.offerType === 'first_order') {
        const userOrderCount = await orderModel.countDocuments({ userId });
        if (userOrderCount > 0) {
          isEligible = false;
          continue;
        }
      }

      if (userId && offer.userUsageLimit) {
        const userUsageCount = await orderModel.countDocuments({
          userId,
          'offersApplied.offerId': offer._id.toString()
        });
        if (userUsageCount >= offer.userUsageLimit) {
          isEligible = false;
          continue;
        }
      }

      if (isEligible) {
        eligibleOffers.push(offer);
      }
    }

    const total = eligibleOffers.length;
    const paged = eligibleOffers.slice(skip, skip + limit);
    sendSuccess(res, req, 200, {
      success: true,
      data: paged,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    sendError(res, req, 500, "Error fetching offers");
  }
};

// Calculate applicable discounts for an order
const calculateDiscounts = async (req, res) => {
  try {
    const { orderAmount, paymentMethod, userId } = req.body;

    if (!orderAmount) {
      return sendError(res, req, 400, "Order amount is required");
    }

    const now = new Date();
    let totalDiscount = 0;
    let deliveryFee = 2; // Default delivery fee
    let freeDelivery = false;
    const appliedOffers = [];

    // Get active offers
    const offers = await offerModel
      .find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        minOrderAmount: { $lte: orderAmount }
      })
      .sort({ priority: -1 });

    // Check for free delivery
    const freeDeliveryOffer = offers.find(
      offer => offer.freeDeliveryEnabled && 
      offer.freeDeliveryThreshold && 
      orderAmount >= offer.freeDeliveryThreshold
    );

    if (freeDeliveryOffer) {
      deliveryFee = 0;
      freeDelivery = true;
      appliedOffers.push({
        offerId: freeDeliveryOffer._id,
        title: freeDeliveryOffer.title,
        type: 'free_delivery',
        discount: 2 // Delivery fee saved
      });
    }

    // Apply payment method discounts
    if (paymentMethod && paymentMethod !== 'cash_on_delivery') {
      const paymentOffers = offers.filter(
        offer => offer.offerType === 'payment_method_discount' &&
        (offer.paymentMethod === paymentMethod || offer.paymentMethod === 'all')
      );

      // Apply the highest priority payment discount
      if (paymentOffers.length > 0) {
        const bestOffer = paymentOffers[0];
        let discount = 0;

        if (bestOffer.discountType === 'percentage') {
          discount = (orderAmount * bestOffer.discountValue) / 100;
          if (bestOffer.maxDiscount && discount > bestOffer.maxDiscount) {
            discount = bestOffer.maxDiscount;
          }
        } else {
          discount = bestOffer.discountValue;
          if (discount > orderAmount) {
            discount = orderAmount;
          }
        }

        totalDiscount += discount;
        appliedOffers.push({
          offerId: bestOffer._id,
          title: bestOffer.title,
          type: 'payment_discount',
          discount: discount
        });
      }
    }

    // Apply first order discount
    if (userId) {
      const userOrderCount = await orderModel.countDocuments({ userId });
      if (userOrderCount === 0) {
        const firstOrderOffers = offers.filter(
          offer => offer.offerType === 'first_order'
        );

        if (firstOrderOffers.length > 0) {
          const bestOffer = firstOrderOffers[0];
          let discount = 0;

          if (bestOffer.discountType === 'percentage') {
            discount = (orderAmount * bestOffer.discountValue) / 100;
            if (bestOffer.maxDiscount && discount > bestOffer.maxDiscount) {
              discount = bestOffer.maxDiscount;
            }
          } else {
            discount = bestOffer.discountValue;
            if (discount > orderAmount) {
              discount = orderAmount;
            }
          }

          totalDiscount += discount;
          appliedOffers.push({
            offerId: bestOffer._id,
            title: bestOffer.title,
            type: 'first_order',
            discount: discount
          });
        }
      }
    }

    // Round discounts
    totalDiscount = Math.round(totalDiscount * 100) / 100;

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        totalDiscount,
        deliveryFee,
        freeDelivery,
        appliedOffers,
        finalAmount: orderAmount - totalDiscount + deliveryFee
      }
    });
  } catch (error) {
    console.error("Error calculating discounts:", error);
    sendError(res, req, 500, "Error calculating discounts", {
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin: Get all offers
const getAllOffers = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);

    const query = {};
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }
    if (req.query.offerType) {
      query.offerType = req.query.offerType;
    }

    const offers = await offerModel
      .find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await offerModel.countDocuments(query);

    sendSuccess(res, req, 200, {
      success: true,
      data: offers,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    sendError(res, req, 500, "Error fetching offers");
  }
};

// Generate unique coupon code
const generateCouponCode = async () => {
  const prefix = 'OFFER';
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate a random 6-character alphanumeric code
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    code = `${prefix}${randomPart}`;
    
    // Check if code already exists
    const existingCoupon = await couponModel.findOne({ code });
    if (!existingCoupon) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    // Fallback: use timestamp-based code
    const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
    code = `${prefix}${timestamp}`;
  }

  return code;
};

// Admin: Create offer
const createOffer = async (req, res) => {
  try {
    const offerData = req.body;
    
    // Create the offer
    const offer = new offerModel(offerData);
    await offer.save();

    // Automatically generate and create a coupon code for this offer
    try {
      const couponCode = await generateCouponCode();
      
      // Create coupon with offer details
      const coupon = new couponModel({
        code: couponCode,
        description: offerData.description || offerData.title || 'Special offer coupon',
        discountType: offerData.discountType || 'percentage',
        discountValue: offerData.discountValue || 0,
        minOrderAmount: offerData.minOrderAmount || 0,
        maxDiscount: offerData.maxDiscount || null,
        validFrom: offerData.validFrom || new Date(),
        validUntil: offerData.validUntil || new Date(),
        usageLimit: offerData.usageLimit || null,
        userUsageLimit: offerData.userUsageLimit || 1,
        applicableTo: offerData.applicableTo || { type: 'all', ids: [] },
        offerId: offer._id,
        isActive: offerData.isActive !== false // Default to true if not specified
      });

      await coupon.save();

      // Update offer with coupon code
      offer.couponCode = couponCode;
      await offer.save();

      sendSuccess(res, req, 201, {
        success: true,
        message: "Offer created successfully with coupon code",
        data: {
          ...offer.toObject(),
          couponCode: couponCode
        }
      });
    } catch (couponError) {
      console.error("Error creating coupon for offer:", couponError);
      // Offer is created but coupon creation failed - still return success
      sendSuccess(res, req, 201, {
        success: true,
        message: "Offer created successfully, but coupon code generation failed",
        data: offer,
        warning: "Coupon code could not be generated"
      });
    }
  } catch (error) {
    console.error("Error creating offer:", error);
    if (error.code === 11000) {
      sendError(res, req, 400, "Offer with this title already exists");
    } else {
      sendError(res, req, 500, "Error creating offer", {
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
};

// Admin: Update offer
const updateOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const updateData = req.body;

    const offer = await offerModel.findByIdAndUpdate(
      offerId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!offer) {
      return sendError(res, req, 404, "Offer not found");
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Offer updated successfully",
      data: offer
    });
  } catch (error) {
    console.error("Error updating offer:", error);
    sendError(res, req, 500, "Error updating offer", {
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Admin: Delete offer
const deleteOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await offerModel.findByIdAndDelete(offerId);

    if (!offer) {
      return sendError(res, req, 404, "Offer not found");
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Offer deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting offer:", error);
    sendError(res, req, 500, "Error deleting offer");
  }
};

// Admin: Toggle offer status
const toggleOfferStatus = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await offerModel.findById(offerId);
    if (!offer) {
      return sendError(res, req, 404, "Offer not found");
    }

    offer.isActive = !offer.isActive;
    await offer.save();

    sendSuccess(res, req, 200, {
      success: true,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'}`,
      data: offer
    });
  } catch (error) {
    console.error("Error toggling offer status:", error);
    sendError(res, req, 500, "Error toggling offer status");
  }
};

export {
  getActiveOffers,
  calculateDiscounts,
  getAllOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOfferStatus
};

