import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import paymentModel from "../models/paymentModel.js";
import offerModel from "../models/offerModel.js";
import { maskOrderForAdmin } from "../utils/dataMaskingUtils.js";

// placing user order for frontend
const placeOrder = async (req, res) => {
  try {
    const { items, amount, address, restaurantId, couponCode, paymentMethod, paymentProvider, paymentDetails } = req.body;
    
    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Order items are required" 
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Order amount must be greater than 0" 
      });
    }

    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: "Delivery address is required" 
      });
    }

    if (!req.body.userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User authentication required" 
      });
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

    // Validate required address fields
    const addressName = address.name || `${address.firstName || ''} ${address.lastName || ''}`.trim();
    const addressPhone = address.phone || '';
    const addressLine1 = address.addressLine1 || address.street || '';
    const addressCity = address.city || '';
    const addressState = address.state || '';
    const addressPincode = address.pincode || address.zipcode || address.zipCode || '';

    if (!addressName || !addressPhone || !addressLine1 || !addressCity || !addressState || !addressPincode) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required address fields. Please provide: name, phone, street, city, state, and pincode." 
      });
    }

    // Generate unique order number
    const generateOrderNumber = () => {
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `ORD${timestamp}${random}`;
    };

    const newOrder = new orderModel({
      userId: req.body.userId,
      orderNumber: generateOrderNumber(),
      items: items.map(item => ({
        foodId: item.foodId || item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image
      })),
      restaurantId: restaurantId || null,
      amount: amount,
      deliveryFee: deliveryFee,
      discount: discount,
      couponCode: appliedCouponCode,
      offersApplied: appliedOffers,
      finalAmount: finalAmount + deliveryFee - discount,
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
      status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'confirmed',
      payment: {
        status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'paid',
        method: paymentMethod || 'cash_on_delivery',
        transactionId: paymentMethod !== 'cash_on_delivery' ? `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}` : '',
        paidAt: paymentMethod !== 'cash_on_delivery' ? new Date() : null
      }
    });
    await newOrder.save();

    // Create payment record (only for non-COD payments)
    if (paymentMethod && paymentMethod !== 'cash_on_delivery') {
      try {
        // Generate transaction ID for online payments
        const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        
        // Extract UPI ID from payment details for payment reference
        const paymentReference = paymentMethod === 'upi' && paymentDetails?.upiId ? paymentDetails.upiId : '';
        
        // Structure paymentDetails according to schema
        const structuredPaymentDetails = {
          upiId: paymentMethod === 'upi' ? (paymentDetails?.upiId || '') : '',
          bankName: paymentMethod === 'netbanking' ? (paymentDetails?.bankName || '') : '',
          cardLast4: (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') ? (paymentDetails?.cardLast4 || '') : '',
          cardType: (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') ? (paymentDetails?.cardType || '') : '',
          walletName: paymentMethod === 'wallet' ? (paymentDetails?.walletName || '') : '',
          accountNumber: paymentDetails?.accountNumber || '',
          ifscCode: paymentDetails?.ifscCode || ''
        };
        
        const payment = new paymentModel({
          orderId: newOrder._id,
          orderNumber: newOrder.orderNumber,
          userId: String(req.body.userId),
          amount: newOrder.finalAmount,
          currency: 'INR',
          paymentMethod: paymentMethod,
          paymentProvider: paymentProvider || '',
          status: 'processing', // Will be updated by payment gateway callback
          paymentDetails: structuredPaymentDetails,
          transactionId: transactionId,
          paymentReference: paymentReference
        });
        await payment.save();
        
        // Update order with transaction ID
        newOrder.payment.transactionId = transactionId;
        await newOrder.save();
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

    res.status(200).json({ 
      success: true, 
      message: "Order placed successfully",
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber
    });
  } catch (error) {
    console.error("Error placing order:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      errors: error.errors,
      name: error.name
    });
    res.status(500).json({ 
      success: false, 
      message: "Error placing order",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify order (kept for backward compatibility with frontend Verify page)
const verifyOrder = async (req, res) => {
  const { orderId } = req.body;
  try {
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    // Order is already confirmed during placement, just return success
    res.status(200).json({ success: true, message: "Order confirmed", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error verifying order" });
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
    
    const total = await orderModel.countDocuments({ userId: req.body.userId });
    const totalPages = Math.ceil(total / actualLimit);
    
    res.status(200).json({ 
      success: true, 
      data: orders,
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
    res.status(500).json({ success: false, message: "Error fetching orders" });
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
    
    const orders = await orderModel
      .find(query)
      .limit(actualLimit)
      .skip(skip)
      .sort({ date: -1 });
    
    const total = await orderModel.countDocuments(query);
    const totalPages = Math.ceil(total / actualLimit);
    
    res.status(200).json({ 
      success: true, 
      data: orders,
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
    res.status(500).json({ success: false, message: "Error fetching orders" });
  }
};

// api for updating status
const updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID and status are required" 
      });
    }

    // Validate status against enum values
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    // Update order with status history
    await orderModel.findByIdAndUpdate(orderId, {
      status: status,
      updatedAt: new Date()
    });
    
    res.status(200).json({ 
      success: true, 
      message: "Status Updated Successfully",
      data: { orderId, status }
    });
  } catch (error) {
    console.log("Error updating order status:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error updating order status",
      error: error.message 
    });
  }
};

// Cancel order (user can cancel their own orders)
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID is required" 
      });
    }
    
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    // Verify that the order belongs to the user
    if (order.userId !== req.body.userId) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only cancel your own orders" 
      });
    }
    
    // Check if order can be cancelled
    const nonCancellableStatuses = ['delivered', 'cancelled'];
    if (nonCancellableStatuses.includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot cancel order with status: ${order.status}` 
      });
    }
    
    // Check if order is out for delivery (usually can't cancel at this stage)
    if (order.status === 'out_for_delivery') {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot cancel order that is out for delivery. Please contact support." 
      });
    }
    
    // Update order status to cancelled
    order.status = 'cancelled';
    order.updatedAt = new Date();
    
    // Add to status history
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: 'cancelled',
      message: 'Order cancelled by user',
      timestamp: new Date(),
      updatedBy: 'user'
    });
    
    // Update payment status if needed (for COD, mark as not paid)
    if (order.payment.method === 'cash_on_delivery') {
      order.payment.status = 'pending';
    }
    
    await order.save();
    
    res.status(200).json({ 
      success: true, 
      message: "Order cancelled successfully",
      data: { orderId, orderNumber: order.orderNumber }
    });
  } catch (error) {
    console.log("Error cancelling order:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error cancelling order",
      error: error.message 
    });
  }
};

// Admin: Create order manually
const createOrder = async (req, res) => {
  try {
    const { userId, items, amount, address, restaurantId, couponCode, paymentMethod, paymentProvider, paymentDetails, status } = req.body;
    
    // Validate required fields
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "userId and items are required" 
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Order amount must be greater than 0" 
      });
    }

    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: "Delivery address is required" 
      });
    }

    // Check if user exists
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Generate order number
    const orderCount = await orderModel.countDocuments() || 0;
    const orderNumber = `ORD-${Date.now()}-${String(orderCount + 1).padStart(6, '0')}`;

    // Calculate final amount (similar to placeOrder logic)
    let finalAmount = amount;
    let discount = 0;
    let deliveryFee = 2;
    let appliedCouponCode = '';
    let appliedOffers = [];
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

    // Calculate delivery fee
    if (amount >= FREE_DELIVERY_THRESHOLD) {
      deliveryFee = 0;
    }

    finalAmount = amount + deliveryFee - discount;

    // Create order
    const order = new orderModel({
      orderNumber,
      userId,
      items,
      amount,
      deliveryFee,
      discount,
      couponCode: appliedCouponCode,
      finalAmount,
      address,
      restaurantId: restaurantId || null,
      status: status || 'pending',
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

    await order.save();

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
        paymentDetails: paymentDetails || {}
      });
      await payment.save();
    }

    res.status(201).json({ 
      success: true, 
      message: "Order created successfully",
      data: { order, orderId: order._id, orderNumber: order.orderNumber }
    });
  } catch (error) {
    console.log("Error creating order:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error creating order",
      error: error.message 
    });
  }
};

// Admin: Delete order
const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if order can be deleted (only if not delivered or cancelled)
    if (order.status === 'delivered') {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot delete delivered orders" 
      });
    }

    // Delete associated payment if exists
    await paymentModel.deleteMany({ orderId: order._id });

    // Delete order
    await orderModel.findByIdAndDelete(orderId);

    res.status(200).json({ 
      success: true, 
      message: "Order deleted successfully" 
    });
  } catch (error) {
    console.log("Error deleting order:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error deleting order",
      error: error.message 
    });
  }
};

export { placeOrder, verifyOrder, userOrders, listOrders, updateStatus, cancelOrder, createOrder, deleteOrder };
