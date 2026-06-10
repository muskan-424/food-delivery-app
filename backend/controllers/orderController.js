import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import paymentModel from "../models/paymentModel.js";
import offerModel from "../models/offerModel.js";
import foodModel from "../models/foodModel.js";
import restaurantModel from "../models/restaurantModel.js";
import { maskOrderForAdmin } from "../utils/dataMaskingUtils.js";
import { recordOrderEvent } from "../services/orderEventService.js";
import { getGeneralQueue } from "../jobs/queue.js";
import { isRestaurantOpenNow, isRestaurantOpenAt } from "../utils/restaurantHours.js";
import { commitStockForLines, restoreStockForOrderItems } from "../services/orderStockService.js";
import { isWithinDeliveryRadius } from "../utils/geoUtils.js";
import { resolveItemPricing } from "../services/foodModifierService.js";
import { transitionOrderById } from "../services/orderTransitionService.js";
import { buildOrderEconomicsSnapshot } from "../services/orderEconomicsService.js";
import {
  redeemLoyaltyPointsAtCheckout,
  refundLoyaltyPoints,
} from "../services/loyaltyService.js";
import { userMatchesCouponSegments } from "../services/segmentService.js";
import { getDynamicPricingMultiplier } from "../services/dynamicPricingService.js";
import { isRestaurantOrderable } from "../utils/restaurantKycUtils.js";
import { grossUnitFromExclusive } from "../utils/menuTaxPricing.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { appConfig } from "../config/appConfig.js";
import { getMediaPublicUrl } from "../utils/mediaStorage.js";
import {
  sanitizeTipAmount,
  computeServiceFeeAmount,
} from "../utils/checkoutPricingUtils.js";
import { sendOrderPlacedEmail } from "../services/orderReceiptEmailService.js";
import { runScheduledOrderAdvancementSweep } from "../services/scheduledOrderService.js";
import groupOrderSessionModel from "../models/groupOrderSessionModel.js";
import groupSplitPaymentModel from "../models/groupSplitPaymentModel.js";
import { ensureEscrowForOrder, cancelEscrowForOrder } from "../services/escrowService.js";

function buildAggregatedStockLines(items) {
  const byFood = new Map();
  for (const row of items) {
    if (!row?._stockTracked || !row?.foodId) continue;
    const key = String(row.foodId);
    const qty = Math.max(1, parseInt(row.quantity, 10) || 1);
    if (!byFood.has(key)) {
      byFood.set(key, { foodId: row.foodId, quantity: qty, name: row.name || "Item" });
    } else {
      byFood.get(key).quantity += qty;
    }
  }
  return Array.from(byFood.values());
}

function resolveScheduledSelection(body) {
  const hasScheduledFor = body?.scheduledFor != null && body?.scheduledFor !== "";
  const hasSlotId = body?.scheduledSlotId != null && body?.scheduledSlotId !== "";
  const hasSlot = !!body?.scheduledSlot;
  const selectedCount =
    Number(hasScheduledFor) + Number(hasSlotId) + Number(hasSlot);
  if (selectedCount > 1) {
    return { error: "Provide only one of scheduledFor, scheduledSlotId or scheduledSlot" };
  }

  const validateSlotWindow = ({ date, startTime, endTime }) => {
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { error: "scheduled slot contains invalid date/time" };
    }
    if (end <= start) {
      return { error: "scheduledSlot.endTime must be after startTime" };
    }
    if (start <= new Date()) {
      return { error: "scheduled slot must be in the future" };
    }
    const maxAheadMs = 7 * 24 * 60 * 60 * 1000;
    if (start.getTime() - Date.now() > maxAheadMs) {
      return { error: "scheduled slot cannot be more than 7 days ahead" };
    }
    return { start };
  };

  const buildSlotId = (date, startTime, endTime) => `${date}|${startTime}-${endTime}`;

  if (hasSlotId) {
    const rawSlotId = String(body.scheduledSlotId).trim();
    const match =
      /^(\d{4}-\d{2}-\d{2})\|(([01]\d|2[0-3]):([0-5]\d))-(([01]\d|2[0-3]):([0-5]\d))$/.exec(
        rawSlotId
      );
    if (!match) {
      return { error: "scheduledSlotId must be in format YYYY-MM-DD|HH:mm-HH:mm" };
    }
    const date = match[1];
    const startTime = match[2];
    const endTime = match[5];
    const validated = validateSlotWindow({ date, startTime, endTime });
    if (validated.error) {
      return { error: validated.error };
    }
    return {
      scheduledFor: validated.start,
      scheduledSlot: {
        slotId: rawSlotId,
        date,
        startTime,
        endTime,
        label: `${startTime}-${endTime}`,
      },
    };
  }

  if (hasSlot) {
    const slot = body.scheduledSlot || {};
    if (!slot.date || !slot.startTime || !slot.endTime) {
      return { error: "scheduledSlot requires date, startTime and endTime" };
    }
    const date = String(slot.date);
    const startTime = String(slot.startTime);
    const endTime = String(slot.endTime);
    const validated = validateSlotWindow({ date, startTime, endTime });
    if (validated.error) {
      return { error: validated.error };
    }
    const slotId = String(slot.slotId || buildSlotId(date, startTime, endTime));
    return {
      scheduledFor: validated.start,
      scheduledSlot: {
        slotId,
        date,
        startTime,
        endTime,
        label: String(slot.label || `${startTime}-${endTime}`),
      },
    };
  }

  if (hasScheduledFor) {
    const sf = new Date(body.scheduledFor);
    if (Number.isNaN(sf.getTime()) || sf <= new Date()) {
      return { error: "scheduledFor must be a valid future date" };
    }
    const maxAheadMs = 7 * 24 * 60 * 60 * 1000;
    if (sf.getTime() - Date.now() > maxAheadMs) {
      return { error: "scheduledFor cannot be more than 7 days ahead" };
    }
    return { scheduledFor: sf, scheduledSlot: null };
  }

  return { scheduledFor: null, scheduledSlot: null };
}

function mapOrderItemsWithImageUrl(orderDoc) {
  const plain = orderDoc?.toObject ? orderDoc.toObject() : { ...(orderDoc || {}) };
  plain.items = Array.isArray(plain.items)
    ? plain.items.map((item) => ({
        ...item,
        imageUrl: getMediaPublicUrl(item?.image),
      }))
    : [];
  return plain;
}

// placing user order for frontend
const placeOrder = async (req, res) => {
  try {
    let {
      items,
      amount,
      address,
      restaurantId,
      couponCode,
      paymentMethod,
      paymentProvider,
      paymentDetails,
      loyaltyPointsToRedeem,
      groupSessionId,
    } = req.body;
    
    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, req, 400, "Order items are required");
    }

    if (!address) {
      return sendError(res, req, 400, "Delivery address is required");
    }

    if (!req.body.userId) {
      return sendError(res, req, 401, "User authentication required");
    }

    const scheduleSelection = resolveScheduledSelection(req.body);
    if (scheduleSelection.error) {
      return sendError(res, req, 400, scheduleSelection.error);
    }
    const { scheduledFor, scheduledSlot } = scheduleSelection;

    // Phase 1: server-side line totals, modifiers, restaurant hours & delivery radius
    restaurantId = restaurantId || null;
    let restaurant = null;
    let groupSession = null;
    let groupOrderMeta = null;
    if (groupSessionId) {
      groupSession = await groupOrderSessionModel.findById(groupSessionId);
      if (!groupSession) {
        return sendError(res, req, 404, "Group order session not found");
      }
      if (groupSession.status !== "open") {
        return sendError(res, req, 400, "Group order session is not open");
      }
      if (String(groupSession.leaderUserId) !== String(req.body.userId)) {
        return sendError(res, req, 403, "Only group leader can place the group order");
      }
      const isMember = (groupSession.members || []).some(
        (m) => String(m.userId) === String(req.body.userId)
      );
      if (!isMember) {
        return sendError(res, req, 403, "Order user is not part of this group session");
      }
      if (
        groupSession.restaurantId &&
        restaurantId &&
        String(groupSession.restaurantId) !== String(restaurantId)
      ) {
        return sendError(res, req, 400, "Group session restaurant does not match order restaurant");
      }
      const splitRows = await groupSplitPaymentModel
        .find({ sessionId: groupSession._id })
        .lean();
      if (splitRows.length > 0) {
        const unpaid = splitRows.filter(
          (r) => Number(r.amount || 0) > 0 && String(r.status) !== "paid"
        );
        if (unpaid.length > 0) {
          return sendError(
            res,
            req,
            400,
            "All member split shares must be paid before placing group order",
            { unpaidCount: unpaid.length }
          );
        }
      }
      groupOrderMeta = {
        sessionId: String(groupSession._id),
        inviteCode: String(groupSession.inviteCode || ""),
        leaderUserId: String(groupSession.leaderUserId || ""),
        memberCount: Array.isArray(groupSession.members) ? groupSession.members.length : 0,
      };
    }
    if (restaurantId) {
      restaurant = await restaurantModel.findById(restaurantId);
      if (!restaurant) {
        return sendError(res, req, 400, "Restaurant not found");
      }
      if (scheduledFor) {
        const { open, reason } = isRestaurantOpenAt(restaurant, scheduledFor);
        if (!open) {
          return sendError(res, req, 400, "Restaurant is not open at the scheduled time", {
            reason,
          });
        }
      } else {
        const { open, reason } = isRestaurantOpenNow(restaurant);
        if (!open) {
          return sendError(
            res,
            req,
            400,
            "Restaurant is not accepting orders right now",
            { reason }
          );
        }
      }
      const cLat = address.coordinates?.lat;
      const cLng = address.coordinates?.lng;
      const within = isWithinDeliveryRadius(restaurant, cLat, cLng);
      if (within === false) {
        return sendError(
          res,
          req,
          400,
          "Delivery address is outside this restaurant's delivery area"
        );
      }
      if (!isRestaurantOrderable(restaurant)) {
        return sendError(res, req, 403, "This restaurant is not approved to accept orders yet", {
          kycStatus: restaurant.kycStatus,
        });
      }
    }

    const pricingAt =
      scheduledFor instanceof Date && !Number.isNaN(scheduledFor.getTime())
        ? scheduledFor
        : new Date();
    const dp = await getDynamicPricingMultiplier({
      restaurantId: restaurantId ? String(restaurantId) : null,
      at: pricingAt,
    });

    const resolvedItems = [];
    let computedSubtotal = 0;
    for (const raw of items) {
      const fid = raw.foodId || raw.id;
      const food = await foodModel.findById(fid);
      if (!food) {
        return sendError(res, req, 400, "One or more menu items are invalid");
      }
      if (!food.isAvailable) {
        return sendError(res, req, 400, `"${food.name}" is not available`);
      }
      if (
        food.stockCount != null &&
        typeof food.stockCount === "number" &&
        food.stockCount < (raw.quantity || 1)
      ) {
        return sendError(res, req, 400, `Insufficient stock for "${food.name}"`);
      }
      if (
        restaurantId &&
        food.restaurantId &&
        String(food.restaurantId) !== String(restaurantId)
      ) {
        return sendError(res, req, 400, "Cart contains items from a different restaurant");
      }
      const { unitPrice: baseUnit, modifierSnapshot, error } = resolveItemPricing(food, raw.modifiers);
      if (error) {
        return sendError(res, req, 400, error);
      }
      let unitPrice =
        dp.multiplier !== 1
          ? Math.round(baseUnit * dp.multiplier * 100) / 100
          : baseUnit;
      const taxR = restaurant ? Number(restaurant.defaultTaxRatePercent) || 0 : 0;
      if (restaurant?.menuPricesIncludeTax && taxR > 0) {
        unitPrice = grossUnitFromExclusive(unitPrice, taxR);
      }
      const qty = Math.max(1, parseInt(raw.quantity, 10) || 1);
      computedSubtotal += unitPrice * qty;
      resolvedItems.push({
        foodId: food._id,
        name: food.name,
        price: unitPrice,
        quantity: qty,
        image: food.image || "",
        modifiers: modifierSnapshot,
        _stockTracked:
          food.stockCount != null && typeof food.stockCount === "number",
      });
    }

    items = resolvedItems;
    amount = Math.round(computedSubtotal * 100) / 100;
    if (!amount || amount <= 0) {
      return sendError(res, req, 400, "Order amount must be greater than 0");
    }

    if (restaurant && restaurant.minimumOrder > 0 && amount < restaurant.minimumOrder) {
      return sendError(
        res,
        req,
        400,
        `Minimum order for this restaurant is ₹${restaurant.minimumOrder}`
      );
    }
    
    // Calculate final amount (with discount if coupon applied)
    let finalAmount = amount;
    let discount = 0;
    let deliveryFee = 2; // Default delivery fee
    let appliedCouponCode = '';
    let appliedOffers = [];
    const FREE_DELIVERY_THRESHOLD = 150; // Free delivery above ₹150

    // Apply coupon if provided
    if (couponCode && couponCode.trim()) {
      try {
        const { validateCoupon } = await import('./couponController.js');
        // Create a mock request/response to validate coupon
        const mockReq = {
          body: {
            code: couponCode.trim().toUpperCase(),
            orderAmount: amount,
            userId: req.body.userId
          }
        };
        
        // We need to validate the coupon properly
        const couponModel = (await import('../models/couponModel.js')).default;
        const coupon = await couponModel.findOne({ 
          code: couponCode.trim().toUpperCase(),
          isActive: true
        });

        if (coupon) {
          const now = new Date();
          if (now >= coupon.validFrom && now <= coupon.validUntil) {
            if (amount >= coupon.minOrderAmount) {
              // Check usage limits
              if (!coupon.usageLimit || coupon.usageCount < coupon.usageLimit) {
                // Check user usage limit
                const userUsageCount = await orderModel.countDocuments({
                  userId: req.body.userId,
                  couponCode: couponCode.trim().toUpperCase()
                });

                if (userUsageCount < coupon.userUsageLimit) {
                  const segmentUser = await userModel
                    .findById(req.body.userId)
                    .select("segmentTags");
                  if (userMatchesCouponSegments(segmentUser?.segmentTags, coupon)) {
                    // Calculate discount
                    if (coupon.discountType === 'percentage') {
                      discount = (amount * coupon.discountValue) / 100;
                      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                        discount = coupon.maxDiscount;
                      }
                    } else {
                      discount = coupon.discountValue;
                      if (discount > amount) {
                        discount = amount;
                      }
                    }
                    discount = Math.round(discount * 100) / 100;
                    appliedCouponCode = coupon.code;

                    // Increment usage count
                    coupon.usageCount = (coupon.usageCount || 0) + 1;
                    await coupon.save();
                  }
                }
              }
            }
          }
        }
      } catch (couponError) {
        console.error("Coupon validation error:", couponError);
        // Continue without coupon if validation fails
      }
    }

    // Apply offers and free delivery
    try {
      const now = new Date();
      
      // Check for free delivery (either from offers or threshold)
      const freeDeliveryOffer = await offerModel.findOne({
        isActive: true,
        freeDeliveryEnabled: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        freeDeliveryThreshold: { $lte: amount }
      }).sort({ freeDeliveryThreshold: -1 }); // Get the best free delivery offer

      if (freeDeliveryOffer && amount >= freeDeliveryOffer.freeDeliveryThreshold) {
        deliveryFee = 0;
        appliedOffers.push({
          offerId: freeDeliveryOffer._id.toString(),
          title: freeDeliveryOffer.title,
          type: 'free_delivery',
          discount: 2
        });
      } else if (amount >= FREE_DELIVERY_THRESHOLD) {
        // Default free delivery threshold
        deliveryFee = 0;
      }

      // Apply payment method discounts
      if (paymentMethod && paymentMethod !== 'cash_on_delivery') {
        const paymentOffers = await offerModel.find({
          isActive: true,
          offerType: 'payment_method_discount',
          validFrom: { $lte: now },
          validUntil: { $gte: now },
          minOrderAmount: { $lte: amount },
          $or: [
            { paymentMethod: paymentMethod },
            { paymentMethod: 'all' }
          ]
        }).sort({ priority: -1, discountValue: -1 }).limit(1);

        if (paymentOffers.length > 0) {
          const paymentOffer = paymentOffers[0];
          let offerDiscount = 0;

          if (paymentOffer.discountType === 'percentage') {
            offerDiscount = (amount * paymentOffer.discountValue) / 100;
            if (paymentOffer.maxDiscount && offerDiscount > paymentOffer.maxDiscount) {
              offerDiscount = paymentOffer.maxDiscount;
            }
          } else {
            offerDiscount = paymentOffer.discountValue;
            if (offerDiscount > amount) {
              offerDiscount = amount;
            }
          }

          discount += offerDiscount;
          appliedOffers.push({
            offerId: paymentOffer._id.toString(),
            title: paymentOffer.title,
            type: 'payment_discount',
            discount: offerDiscount
          });

          // Update offer usage count
          paymentOffer.usageCount = (paymentOffer.usageCount || 0) + 1;
          await paymentOffer.save();
        }
      }

      // Apply first order discount
      const userOrderCount = await orderModel.countDocuments({ userId: req.body.userId });
      if (userOrderCount === 0) {
        const firstOrderOffers = await offerModel.find({
          isActive: true,
          offerType: 'first_order',
          validFrom: { $lte: now },
          validUntil: { $gte: now },
          minOrderAmount: { $lte: amount }
        }).sort({ priority: -1, discountValue: -1 }).limit(1);

        if (firstOrderOffers.length > 0) {
          const firstOrderOffer = firstOrderOffers[0];
          let offerDiscount = 0;

          if (firstOrderOffer.discountType === 'percentage') {
            offerDiscount = (amount * firstOrderOffer.discountValue) / 100;
            if (firstOrderOffer.maxDiscount && offerDiscount > firstOrderOffer.maxDiscount) {
              offerDiscount = firstOrderOffer.maxDiscount;
            }
          } else {
            offerDiscount = firstOrderOffer.discountValue;
            if (offerDiscount > amount) {
              offerDiscount = amount;
            }
          }

          discount += offerDiscount;
          appliedOffers.push({
            offerId: firstOrderOffer._id.toString(),
            title: firstOrderOffer.title,
            type: 'first_order',
            discount: offerDiscount
          });

          // Update offer usage count
          firstOrderOffer.usageCount = (firstOrderOffer.usageCount || 0) + 1;
          await firstOrderOffer.save();
        }
      }

      // Round total discount
      discount = Math.round(discount * 100) / 100;
    } catch (offerError) {
      console.error("Error applying offers:", offerError);
      // Continue without offers if there's an error
    }

    const itemsNetAfterDiscount = Math.round((amount - discount) * 100) / 100;
    const tipSanitize = sanitizeTipAmount(req.body.tipAmount, amount);
    if (tipSanitize.error) {
      return sendError(res, req, 400, tipSanitize.error);
    }
    const tipAmount = tipSanitize.tipAmount;
    const serviceFeeAmount = computeServiceFeeAmount(itemsNetAfterDiscount);

    // Validate required address fields
    const addressName = address.name || `${address.firstName || ''} ${address.lastName || ''}`.trim();
    const addressPhone = address.phone || '';
    const addressLine1 = address.addressLine1 || address.street || '';
    const addressCity = address.city || '';
    const addressState = address.state || '';
    const addressPincode = address.pincode || address.zipcode || address.zipCode || '';

    if (!addressName || !addressPhone || !addressLine1 || !addressCity || !addressState || !addressPincode) {
      return sendError(
        res,
        req,
        400,
        "Missing required address fields. Please provide: name, phone, street, city, state, and pincode."
      );
    }

    const stockLines = buildAggregatedStockLines(items);

    let inventoryReserved = false;
    if (stockLines.length > 0) {
      const committed = await commitStockForLines(stockLines);
      if (!committed.ok) {
        return sendError(
          res,
          req,
          409,
          "Insufficient stock — please refresh your cart and try again"
        );
      }
      inventoryReserved = true;
    }

    const baseTotalBeforeLoyalty =
      Math.round(
        (amount + deliveryFee - discount + tipAmount + serviceFeeAmount) * 100
      ) / 100;
    const loyaltyRedeemResult = await redeemLoyaltyPointsAtCheckout(
      req.body.userId,
      loyaltyPointsToRedeem,
      baseTotalBeforeLoyalty
    );
    if (!loyaltyRedeemResult.ok) {
      if (inventoryReserved) {
        await restoreStockForOrderItems(stockLines);
      }
      return sendError(
        res,
        req,
        400,
        loyaltyRedeemResult.message || "Loyalty redemption failed",
        { code: loyaltyRedeemResult.code }
      );
    }
    const loyaltyPointsUsed = loyaltyRedeemResult.pointsUsed || 0;
    const loyaltyRedeemInr = loyaltyRedeemResult.redeemInr || 0;
    const finalAmountAfterLoyalty = Math.max(
      0,
      Math.round((baseTotalBeforeLoyalty - loyaltyRedeemInr) * 100) / 100
    );

    const orderItemsForDb = items.map(
      ({ foodId, name, price, quantity, image, modifiers }) => ({
        foodId,
        name,
        price,
        quantity,
        image: image || "",
        modifiers: modifiers || [],
      })
    );

    // Generate unique order number
    const generateOrderNumber = () => {
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `ORD${timestamp}${random}`;
    };

    const isRazorpay = paymentMethod === "razorpay";
    const initialStatus =
      paymentMethod === "cash_on_delivery"
        ? "pending"
        : isRazorpay
          ? "pending"
          : "confirmed";
    const loyaltyFromItems = Math.min(loyaltyRedeemInr, itemsNetAfterDiscount);
    const netItemTotal =
      Math.round((itemsNetAfterDiscount - loyaltyFromItems) * 100) / 100;
    const economics = restaurant
      ? buildOrderEconomicsSnapshot(restaurant, { netItemTotal })
      : {
          commissionSnapshot: {
            percent: 0,
            basisAmount: 0,
            amount: 0,
            estimatedRestaurantNet: 0,
          },
          taxSnapshot: {
            label: "",
            ratePercent: 0,
            taxableBasis: 0,
            amount: 0,
            taxInclusiveMenu: false,
          },
        };
    const dynamicPricingSnapshot =
      dp.multiplier !== 1
        ? {
            multiplier: dp.multiplier,
            ruleId: dp.ruleId,
            label: dp.label,
            source: dp.source,
            appliedAt: new Date(),
          }
        : null;
    const newOrder = new orderModel({
      userId: req.body.userId,
      orderNumber: generateOrderNumber(),
      items: orderItemsForDb,
      restaurantId: restaurantId || null,
      amount: amount,
      tipAmount,
      serviceFeeAmount,
      deliveryFee: deliveryFee,
      discount: discount,
      couponCode: appliedCouponCode,
      offersApplied: appliedOffers,
      finalAmount: finalAmountAfterLoyalty,
      loyaltyPointsRedeemed: loyaltyPointsUsed,
      loyaltyRedeemInr,
      ...(groupOrderMeta ? { groupOrder: groupOrderMeta } : {}),
      ...economics,
      inventoryReserved,
      address: {
        type: address.type || 'home',
        name: addressName,
        email: address.email || '',
        phone: addressPhone,
        addressLine1: addressLine1,
        addressLine2: address.addressLine2 || '',
        city: addressCity,
        state: addressState,
        pincode: addressPincode,
        country: address.country || '',
        landmark: address.landmark || '',
        coordinates: address.coordinates || {}
      },
      status: initialStatus,
      scheduledFor: scheduledFor || undefined,
      scheduledSlot: scheduledSlot || null,
      menuPricedAt: new Date(),
      ...(dynamicPricingSnapshot ? { dynamicPricingSnapshot } : {}),
      statusHistory: [
        {
          status: initialStatus,
          message: 'Order placed',
          timestamp: new Date(),
          updatedBy: 'user',
        },
      ],
      payment: {
        status:
          paymentMethod === "cash_on_delivery"
            ? "pending"
            : isRazorpay
              ? "pending"
              : "paid",
        method: paymentMethod || "cash_on_delivery",
        transactionId:
          paymentMethod === "cash_on_delivery" || isRazorpay
            ? ""
            : `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        paidAt:
          paymentMethod === "cash_on_delivery" || isRazorpay ? null : new Date(),
      },
    });
    try {
      await newOrder.save();
      if (groupSession) {
        groupSession.status = "ordered";
        groupSession.orderId = newOrder._id;
        groupSession.closedAt = new Date();
        await groupSession.save();
      }
    } catch (saveErr) {
      if (inventoryReserved) {
        await restoreStockForOrderItems(stockLines);
      }
      if (loyaltyPointsUsed > 0) {
        await refundLoyaltyPoints(req.body.userId, loyaltyPointsUsed);
      }
      throw saveErr;
    }

    await recordOrderEvent({
      orderId: newOrder._id,
      type: "order.placed",
      payload: {
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
        finalAmount: newOrder.finalAmount,
        paymentMethod: paymentMethod || "cash_on_delivery",
        scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
        scheduledSlotId: scheduledSlot?.slotId || null,
        scheduledSlot: scheduledSlot || null,
        dynamicPricing: dynamicPricingSnapshot || null,
      },
      actor: { kind: "user", id: req.body.userId },
    });

    if (scheduledFor) {
      await recordOrderEvent({
        orderId: newOrder._id,
        type: "order.scheduled",
        payload: {
          scheduledFor: scheduledFor.toISOString(),
          scheduledSlotId: scheduledSlot?.slotId || null,
          scheduledSlot: scheduledSlot || null,
        },
        actor: { kind: "user", id: req.body.userId },
      });
    }

    const queue = getGeneralQueue();
    if (queue) {
      queue
        .add(
          "order.placed",
          {
            orderId: String(newOrder._id),
            orderNumber: newOrder.orderNumber,
            userId: String(req.body.userId),
          },
          { removeOnComplete: 100, removeOnFail: 50 }
        )
        .catch((err) => console.error("order.placed queue add failed:", err.message));
    }

    // Create payment record (only for non-COD payments)
    if (paymentMethod && paymentMethod !== 'cash_on_delivery') {
      try {
        const isRz = paymentMethod === "razorpay";
        const transactionId = isRz
          ? ""
          : `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Extract UPI ID from payment details for payment reference
        const paymentReference =
          paymentMethod === "upi" && paymentDetails?.upiId ? paymentDetails.upiId : "";

        // Structure paymentDetails according to schema
        const structuredPaymentDetails = {
          upiId: paymentMethod === "upi" ? paymentDetails?.upiId || "" : "",
          bankName: paymentMethod === "netbanking" ? paymentDetails?.bankName || "" : "",
          cardLast4:
            paymentMethod === "credit_card" || paymentMethod === "debit_card"
              ? paymentDetails?.cardLast4 || ""
              : "",
          cardType:
            paymentMethod === "credit_card" || paymentMethod === "debit_card"
              ? paymentDetails?.cardType || ""
              : "",
          walletName: paymentMethod === "wallet" ? paymentDetails?.walletName || "" : "",
          accountNumber: paymentDetails?.accountNumber || "",
          ifscCode: paymentDetails?.ifscCode || "",
        };

        const payment = new paymentModel({
          orderId: newOrder._id,
          orderNumber: newOrder.orderNumber,
          userId: String(req.body.userId),
          amount: newOrder.finalAmount,
          currency: "INR",
          paymentMethod: paymentMethod,
          paymentProvider: isRz ? "razorpay" : paymentProvider || "",
          status: "processing",
          paymentDetails: structuredPaymentDetails,
          transactionId: transactionId,
          paymentReference: paymentReference,
          breakdown: {
            itemsSubtotal: amount,
            deliveryFeeAmount: deliveryFee,
            discountAmount: discount,
            tipAmount,
            serviceFeeAmount,
            loyaltyRedeemInr: loyaltyRedeemInr || 0,
          },
        });
        await payment.save();

        await ensureEscrowForOrder({
          orderId: newOrder._id,
          userId: req.body.userId,
          amount: newOrder.finalAmount,
          currency: "INR",
        });

        if (!isRz) {
          newOrder.payment.transactionId = transactionId;
          await newOrder.save();
        }
      } catch (paymentError) {
        console.error("Error creating payment record:", paymentError);
        console.error("Payment error details:", {
          message: paymentError.message,
          stack: paymentError.stack,
          errors: paymentError.errors
        });
        // Don't fail the order if payment record creation fails, but log it
        // The order is already saved, so we can continue
      }
    }
    await userModel.findByIdAndUpdate(req.body.userId, { cartData: {} });

    // Update user email if provided
    if (address.email && address.email.trim()) {
      try {
        await userModel.findByIdAndUpdate(
          req.body.userId,
          { email: address.email.trim() },
          { new: true }
        );
      } catch (emailError) {
        console.error("Error updating user email:", emailError);
        // Continue even if email update fails
      }
    }

    // Auto-save address if not already saved
    try {
      const user = await userModel.findById(req.body.userId);
      if (user) {
        const addressData = {
          addressLine1: address.addressLine1 || address.street || '',
          city: address.city || '',
          state: address.state || '',
          pincode: address.pincode || address.zipcode || address.zipCode || '',
          email: address.email || user.email || '',
          country: address.country || '',
        };

        // Check if this address already exists
        const addressExists = user.addresses.some(addr => 
          addr.addressLine1 === addressData.addressLine1 &&
          addr.city === addressData.city &&
          addr.state === addressData.state &&
          addr.pincode === addressData.pincode
        );

        if (!addressExists && addressData.addressLine1 && addressData.city && addressData.state && addressData.pincode) {
          const crypto = (await import('crypto')).default;
          const addressId = crypto.randomUUID();
          const newAddress = {
            addressId,
            type: address.type || 'home',
            name: address.name || `${address.firstName || ''} ${address.lastName || ''}`.trim() || 'Delivery Address',
            email: (address.email && address.email.trim()) || (user.email && user.email.trim()) || '',
            phone: address.phone || user.phone || '',
            addressLine1: addressData.addressLine1,
            addressLine2: address.addressLine2 || '',
            city: addressData.city,
            state: addressData.state,
            pincode: addressData.pincode,
            country: addressData.country || '',
            landmark: address.landmark || '',
            isDefault: user.addresses.length === 0, // Set as default if first address
            coordinates: address.coordinates || {}
          };

          user.addresses.push(newAddress);
          await user.save();
        }
      }
    } catch (addressError) {
      console.error("Error auto-saving address:", addressError);
      // Don't fail order placement if address save fails
    }

    orderModel
      .findById(newOrder._id)
      .then((ord) => {
        if (ord) {
          return sendOrderPlacedEmail(ord);
        }
        return false;
      })
      .catch((e) => console.error("order placed email:", e));

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Order placed successfully",
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
      finalAmount: newOrder.finalAmount,
      tipAmount,
      serviceFeeAmount,
      loyaltyPointsRedeemed: loyaltyPointsUsed,
      loyaltyRedeemInr,
      scheduledFor: newOrder.scheduledFor || null,
      scheduledSlotId: newOrder.scheduledSlot?.slotId || null,
      scheduledSlot: newOrder.scheduledSlot || null,
      dynamicPricing: dynamicPricingSnapshot || null,
      groupSessionId: groupOrderMeta?.sessionId || null,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      errors: error.errors,
      name: error.name
    });
    sendError(res, req, 500, "Error placing order", {
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Verify order (kept for backward compatibility with frontend Verify page)
const verifyOrder = async (req, res) => {
  const { orderId } = req.body;
  try {
    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }
    
    // Order is already confirmed during placement, just return success
    sendSuccess(res, req, 200, { success: true, message: "Order confirmed", order });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error verifying order");
  }
};

// user orders for frontend with pagination
const userOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const maxLimit = 100;
    const actualLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * actualLimit;
    
    const orders = await orderModel
      .find({ userId: req.body.userId })
      .limit(actualLimit)
      .skip(skip)
      .sort({ date: -1 });
    const data = orders.map((o) => mapOrderItemsWithImageUrl(o));
    
    const total = await orderModel.countDocuments({ userId: req.body.userId });
    const totalPages = Math.ceil(total / actualLimit);
    
    sendSuccess(res, req, 200, { 
      success: true, 
      data,
      pagination: {
        page,
        limit: actualLimit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching orders");
  }
};

// Listing orders for admin panel with pagination
const listOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const maxLimit = 100;
    const actualLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * actualLimit;
    
    // Optional filtering
    const status = req.query.status;
    const query = status ? { status: status } : {};
    if (req.query.restaurantId) {
      query.restaurantId = req.query.restaurantId;
    }
    const scheduled = String(req.query.scheduled || "").toLowerCase();
    const dueOnly = String(req.query.dueOnly || "").toLowerCase();
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (fromRaw && Number.isNaN(from?.getTime())) {
      return sendError(res, req, 400, "Invalid from date. Use ISO date-time");
    }
    if (toRaw && Number.isNaN(to?.getTime())) {
      return sendError(res, req, 400, "Invalid to date. Use ISO date-time");
    }
    if (from && to && from > to) {
      return sendError(res, req, 400, "from must be less than or equal to to");
    }
    const now = new Date();
    if (scheduled === "true") {
      query.scheduledFor = { $ne: null };
    } else if (scheduled === "false") {
      query.$or = [{ scheduledFor: null }, { scheduledFor: { $exists: false } }];
    }
    if (dueOnly === "true") {
      query.scheduledFor = { ...(query.scheduledFor || {}), $ne: null, $lte: now };
    }
    if (from || to) {
      query.scheduledFor = {
        ...(query.scheduledFor || {}),
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    
    const orders = await orderModel
      .find(query)
      .limit(actualLimit)
      .skip(skip)
      .sort({ date: -1 });

    const enhancedOrders = orders.map((o) => {
      const plain = mapOrderItemsWithImageUrl(o);
      const sf = plain.scheduledFor ? new Date(plain.scheduledFor) : null;
      const mins =
        sf && sf > now ? Math.ceil((sf.getTime() - now.getTime()) / 60000) : 0;
      return {
        ...plain,
        scheduleMeta: {
          scheduledFor: plain.scheduledFor || null,
          scheduledSlotId: plain.scheduledSlot?.slotId || null,
          scheduledSlot: plain.scheduledSlot || null,
          isScheduled: !!sf,
          isScheduleDue: !!(sf && sf <= now),
          minutesUntilScheduled: mins,
        },
      };
    });
    
    const total = await orderModel.countDocuments(query);
    const totalPages = Math.ceil(total / actualLimit);
    
    sendSuccess(res, req, 200, { 
      success: true, 
      data: enhancedOrders,
      pagination: {
        page,
        limit: actualLimit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching orders");
  }
};

const getScheduledOrderSummary = async (req, res) => {
  try {
    const now = new Date();
    const overdueGraceMinutes = appConfig.scheduledOrderOverdueGraceMinutes;
    const overdueBefore = new Date(now.getTime() - overdueGraceMinutes * 60 * 1000);
    const restaurantId = req.query.restaurantId || null;
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (fromRaw && Number.isNaN(from?.getTime())) {
      return sendError(res, req, 400, "Invalid from date. Use ISO date-time");
    }
    if (toRaw && Number.isNaN(to?.getTime())) {
      return sendError(res, req, 400, "Invalid to date. Use ISO date-time");
    }
    if (from && to && from > to) {
      return sendError(res, req, 400, "from must be less than or equal to to");
    }

    const baseMatch = {
      scheduledFor: { $ne: null },
      ...(restaurantId ? { restaurantId } : {}),
    };
    if (from || to) {
      baseMatch.scheduledFor = {
        ...baseMatch.scheduledFor,
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const [summary] = await orderModel.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          upcoming: [
            { $match: { scheduledFor: { $gt: now } } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
          due: [
            { $match: { scheduledFor: { $lte: now }, status: "pending" } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
          overdue: [
            {
              $match: {
                scheduledFor: { $lte: overdueBefore },
                status: "pending",
              },
            },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
          allScheduledByStatus: [
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const toMap = (rows = []) =>
      rows.reduce((acc, r) => {
        acc[r._id] = r.count;
        return acc;
      }, {});

    const countTotal = (rows = []) => rows.reduce((sum, r) => sum + r.count, 0);

    sendSuccess(res, req, 200, {
      success: true,
      data: {
        generatedAt: now.toISOString(),
        overdueGraceMinutes,
        filters: {
          restaurantId: restaurantId || null,
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
        },
        counts: {
          upcoming: countTotal(summary?.upcoming),
          due: countTotal(summary?.due),
          overdue: countTotal(summary?.overdue),
          totalScheduled: countTotal(summary?.allScheduledByStatus),
        },
        byStatus: {
          upcoming: toMap(summary?.upcoming),
          due: toMap(summary?.due),
          overdue: toMap(summary?.overdue),
          allScheduled: toMap(summary?.allScheduledByStatus),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching scheduled order summary:", error);
    sendError(res, req, 500, "Error fetching scheduled order summary");
  }
};

const triggerScheduledOrderAdvancement = async (req, res) => {
  try {
    const rawLimit = req.body?.limit;
    let limit = appConfig.scheduledOrderAdvancementLimit;
    if (rawLimit != null && rawLimit !== "") {
      const n = Number(rawLimit);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return sendError(res, req, 400, "limit must be an integer between 1 and 500");
      }
      limit = n;
    }
    const rawDryRun = req.body?.dryRun;
    const dryRun =
      rawDryRun === true ||
      rawDryRun === "true" ||
      rawDryRun === 1 ||
      rawDryRun === "1";
    const rawRestaurantId = req.body?.restaurantId;
    let restaurantId = null;
    if (rawRestaurantId != null && rawRestaurantId !== "") {
      const id = String(rawRestaurantId).trim();
      if (!/^[a-fA-F0-9]{24}$/.test(id)) {
        return sendError(res, req, 400, "restaurantId must be a valid Mongo ID");
      }
      restaurantId = id;
    }
    const result = await runScheduledOrderAdvancementSweep({
      limit,
      dryRun,
      restaurantId,
      source: "manual",
    });
    return sendSuccess(res, req, 200, {
      success: true,
      message: dryRun
        ? "Scheduled order advancement dry-run completed"
        : "Scheduled order advancement sweep completed",
      data: {
        ...result,
        usedLimit: limit,
        dryRun,
        triggeredAt: new Date().toISOString(),
        triggeredBy: req.body?.userId || null,
      },
    });
  } catch (error) {
    console.error("Error triggering scheduled order advancement:", error);
    return sendError(res, req, 500, "Error triggering scheduled order advancement");
  }
};

// api for updating status
const updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const actorRole = req.body.role === "admin" ? "admin" : "restaurant_staff";
    
    if (!orderId || !status) {
      return sendError(res, req, 400, "Order ID and status are required");
    }

    // Validate status against enum values
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return sendError(
        res,
        req,
        400,
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }
    
    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    const result = await transitionOrderById(orderId, status, {
      message: `${actorRole === "admin" ? "Admin" : "Restaurant staff"} set status to ${status}`,
      updatedBy: actorRole,
      allowDeliveryAssign: status === "out_for_delivery",
      allowAdminCancelDelivery: actorRole === "admin" && status === "cancelled",
    });

    if (!result.ok) {
      if (result.code === "INVALID_TRANSITION") {
        return sendError(
          res,
          req,
          400,
          `Invalid status transition from ${result.from} to ${result.to}`
        );
      }
      return sendError(res, req, 404, "Order not found");
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Status Updated Successfully",
      data: { orderId, status: result.order.status, statusHistory: result.order.statusHistory }
    });
  } catch (error) {
    console.log("Error updating order status:", error);
    sendError(res, req, 500, "Error updating order status", { error: error.message });
  }
};

// Cancel order (user can cancel their own orders)
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return sendError(res, req, 400, "Order ID is required");
    }
    
    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }
    
    // Verify that the order belongs to the user
    if (order.userId !== req.body.userId) {
      return sendError(res, req, 403, "You can only cancel your own orders");
    }
    
    // Check if order can be cancelled
    const nonCancellableStatuses = ['delivered', 'cancelled'];
    if (nonCancellableStatuses.includes(order.status)) {
      return sendError(res, req, 400, `Cannot cancel order with status: ${order.status}`);
    }
    
    // Check if order is out for delivery (usually can't cancel at this stage)
    if (order.status === 'out_for_delivery') {
      return sendError(
        res,
        req,
        400,
        "Cannot cancel order that is out for delivery. Please contact support."
      );
    }
    
    const result = await transitionOrderById(orderId, "cancelled", {
      message: "Order cancelled by user",
      updatedBy: "user",
      actorUserId: req.body.userId,
    });

    if (!result.ok) {
      if (result.code === "INVALID_TRANSITION") {
        return sendError(res, req, 400, `Cannot cancel order with status: ${result.from}`);
      }
      return sendError(res, req, 404, "Order not found");
    }

    if (result.order.payment?.method === "cash_on_delivery") {
      await orderModel.findByIdAndUpdate(orderId, { "payment.status": "pending" });
    }

    await cancelEscrowForOrder(orderId, {
      reason: "order_cancelled_by_user",
      actor: { kind: "user", id: String(req.body.userId) },
    });

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Order cancelled successfully",
      data: { orderId, orderNumber: order.orderNumber }
    });
  } catch (error) {
    console.log("Error cancelling order:", error);
    sendError(res, req, 500, "Error cancelling order", { error: error.message });
  }
};

// Admin: Create order manually
const createOrder = async (req, res) => {
  try {
    const { userId, items, address, restaurantId, couponCode, paymentMethod, paymentProvider, paymentDetails, status } = req.body;
    
    // Validate required fields
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, req, 400, "userId and items are required");
    }

    if (!address) {
      return sendError(res, req, 400, "Delivery address is required");
    }

    // Check if user exists
    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, req, 404, "User not found");
    }

    // Generate order number
    const orderCount = await orderModel.countDocuments() || 0;
    const orderNumber = `ORD-${Date.now()}-${String(orderCount + 1).padStart(6, '0')}`;

    const normalizedItems = items.map((row) => {
      const fid = row.foodId || row.id;
      const qty = Math.max(1, parseInt(row.quantity, 10) || 1);
      return {
        foodId: fid,
        name: row.name || '',
        price: typeof row.price === 'number' ? row.price : Number(row.price) || 0,
        quantity: qty,
        image: row.image || '',
        modifiers: Array.isArray(row.modifiers) ? row.modifiers : [],
      };
    });

    for (const row of normalizedItems) {
      if (!row.foodId) {
        return sendError(res, req, 400, "Each item must include foodId (or id)");
      }
    }

    let restaurantDoc = null;
    if (restaurantId) {
      restaurantDoc = await restaurantModel.findById(restaurantId);
    }

    const stockByFood = new Map();
    for (const row of normalizedItems) {
      const food = await foodModel.findById(row.foodId);
      if (!food) {
        return sendError(res, req, 400, "One or more menu items are invalid");
      }
      if (!food.isAvailable) {
        return sendError(res, req, 400, `"${food.name}" is not available`);
      }
      if (food.stockCount != null && typeof food.stockCount === "number") {
        const key = String(food._id);
        const nextQty = (stockByFood.get(key)?.quantity || 0) + row.quantity;
        if (food.stockCount < nextQty) {
          return sendError(res, req, 400, `Insufficient stock for "${food.name}"`);
        }
        stockByFood.set(key, { foodId: food._id, quantity: nextQty, name: food.name });
      }
      if (!row.name) row.name = food.name;
      if (row.price == null || row.price === 0) row.price = food.price;
    }

    const taxRAdmin = restaurantDoc ? Number(restaurantDoc.defaultTaxRatePercent) || 0 : 0;
    if (restaurantDoc?.menuPricesIncludeTax && taxRAdmin > 0) {
      for (const row of normalizedItems) {
        row.price = grossUnitFromExclusive(Number(row.price) || 0, taxRAdmin);
      }
    }

    let amount = 0;
    for (const row of normalizedItems) {
      amount += row.price * row.quantity;
    }
    amount = Math.round(amount * 100) / 100;
    if (!amount || amount <= 0) {
      return sendError(res, req, 400, "Order amount must be greater than 0");
    }

    let discount = 0;
    let deliveryFee = 2;
    let appliedCouponCode = '';
    const FREE_DELIVERY_THRESHOLD = 150;

    // Apply coupon if provided
    if (couponCode && couponCode.trim()) {
      const couponModel = (await import('../models/couponModel.js')).default;
      const coupon = await couponModel.findOne({ 
        code: couponCode.trim().toUpperCase(),
        isActive: true
      });

      if (coupon) {
        const now = new Date();
        if (now >= coupon.validFrom && now <= coupon.validUntil && amount >= coupon.minOrderAmount) {
          if (userMatchesCouponSegments(user.segmentTags, coupon)) {
            if (coupon.discountType === 'percentage') {
              discount = (amount * coupon.discountValue) / 100;
              if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
              }
            } else {
              discount = coupon.discountValue;
              if (discount > amount) discount = amount;
            }
            discount = Math.round(discount * 100) / 100;
            appliedCouponCode = coupon.code;
          }
        }
      }
    }

    // Calculate delivery fee
    if (amount >= FREE_DELIVERY_THRESHOLD) {
      deliveryFee = 0;
    }

    const tipAmount = 0;
    const serviceFeeAmount = 0;
    const finalAmount = amount + deliveryFee - discount + tipAmount + serviceFeeAmount;

    const stockLines = Array.from(stockByFood.values());

    let inventoryReserved = false;
    if (stockLines.length > 0) {
      const committed = await commitStockForLines(stockLines);
      if (!committed.ok) {
        return sendError(res, req, 409, "Insufficient stock — please retry");
      }
      inventoryReserved = true;
    }

    const itemsForOrder = normalizedItems.map((row) => ({
      foodId: row.foodId,
      name: row.name,
      price: row.price,
      quantity: row.quantity,
      image: row.image || '',
      modifiers: row.modifiers || [],
    }));

    const netItemTotal = Math.round((amount - discount) * 100) / 100;
    const economics = restaurantDoc
      ? buildOrderEconomicsSnapshot(restaurantDoc, { netItemTotal })
      : {
          commissionSnapshot: {
            percent: 0,
            basisAmount: 0,
            amount: 0,
            estimatedRestaurantNet: 0,
          },
          taxSnapshot: {
            label: "",
            ratePercent: 0,
            taxableBasis: 0,
            amount: 0,
            taxInclusiveMenu: false,
          },
        };

    // Create order
    const order = new orderModel({
      orderNumber,
      userId,
      items: itemsForOrder,
      amount,
      tipAmount,
      serviceFeeAmount,
      deliveryFee,
      discount,
      couponCode: appliedCouponCode,
      finalAmount,
      address,
      restaurantId: restaurantId || null,
      status: status || 'pending',
      menuPricedAt: new Date(),
      inventoryReserved,
      ...economics,
      payment: {
        method: paymentMethod || 'cash_on_delivery',
        provider: paymentProvider || '',
        status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'processing',
        details: paymentDetails || {}
      },
      statusHistory: [{
        status: status || 'pending',
        message: 'Order created by admin',
        timestamp: new Date(),
        updatedBy: 'admin'
      }]
    });

    try {
      await order.save();
    } catch (saveErr) {
      if (inventoryReserved) {
        await restoreStockForOrderItems(stockLines);
      }
      throw saveErr;
    }

    // Create payment record if not COD
    if (paymentMethod && paymentMethod !== 'cash_on_delivery') {
      const payment = new paymentModel({
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId,
        amount: finalAmount,
        paymentMethod,
        paymentProvider: paymentProvider || '',
        status: 'processing',
        paymentDetails: paymentDetails || {},
        breakdown: {
          itemsSubtotal: amount,
          deliveryFeeAmount: deliveryFee,
          discountAmount: discount,
          tipAmount,
          serviceFeeAmount,
          loyaltyRedeemInr: 0,
        },
      });
      await payment.save();
    }

    sendSuccess(res, req, 201, { 
      success: true, 
      message: "Order created successfully",
      data: { order, orderId: order._id, orderNumber: order.orderNumber }
    });
  } catch (error) {
    console.log("Error creating order:", error);
    sendError(res, req, 500, "Error creating order", { error: error.message });
  }
};

// Admin: Delete order
const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    // Check if order can be deleted (only if not delivered or cancelled)
    if (order.status === 'delivered') {
      return sendError(res, req, 400, "Cannot delete delivered orders");
    }

    if (order.inventoryReserved) {
      await restoreStockForOrderItems(order.items);
    }

    // Delete associated payment if exists
    await paymentModel.deleteMany({ orderId: order._id });

    // Delete order
    await orderModel.findByIdAndDelete(orderId);

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Order deleted successfully" 
    });
  } catch (error) {
    console.log("Error deleting order:", error);
    sendError(res, req, 500, "Error deleting order", { error: error.message });
  }
};

const getDynamicPricingQuote = async (req, res) => {
  try {
    const restaurantId = req.query.restaurantId || null;
    let at = new Date();
    if (req.query.scheduledFor) {
      const d = new Date(req.query.scheduledFor);
      if (!Number.isNaN(d.getTime())) at = d;
    }
    const dp = await getDynamicPricingMultiplier({
      restaurantId: restaurantId ? String(restaurantId) : null,
      at,
    });
    sendSuccess(res, req, 200, { success: true, data: dp });
  } catch (error) {
    console.error("getDynamicPricingQuote:", error);
    sendError(res, req, 500, "Error loading pricing");
  }
};

const getCheckoutHints = (req, res) => {
  return sendSuccess(res, req, 200, {
    success: true,
    data: {
      serviceFeePercent: appConfig.checkoutServiceFeePercent,
      serviceFeeMaxInr: appConfig.checkoutServiceFeeMaxInr,
      tipMaxPercentOfSubtotal: appConfig.checkoutTipMaxPercentOfSubtotal,
      tipMaxFixedInr: appConfig.checkoutTipMaxFixedInr,
    },
  });
};

export {
  placeOrder,
  verifyOrder,
  userOrders,
  listOrders,
  updateStatus,
  cancelOrder,
  createOrder,
  deleteOrder,
  getDynamicPricingQuote,
  getScheduledOrderSummary,
  triggerScheduledOrderAdvancement,
  getCheckoutHints,
};
