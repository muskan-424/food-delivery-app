import paymentModel from "../models/paymentModel.js";
import orderModel from "../models/orderModel.js";
import mongoose from "mongoose";

// Create payment record
const createPayment = async (req, res) => {
  try {
    const { orderId, paymentMethod, paymentProvider, paymentDetails } = req.body;
    const userId = req.body.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    // Find the order
    const order = await orderModel.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if payment already exists
    const existingPayment = await paymentModel.findOne({ orderId });
    if (existingPayment) {
      return res.status(409).json({ 
        success: false, 
        message: "Payment already exists for this order",
        paymentId: existingPayment._id
      });
    }

    // Create payment record
    const payment = new paymentModel({
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: String(userId),
      amount: order.finalAmount,
      currency: 'INR',
      paymentMethod: paymentMethod || 'cash_on_delivery',
      paymentProvider: paymentProvider || '',
      status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'processing',
      paymentDetails: paymentDetails || {},
      transactionId: '',
      paymentReference: ''
    });

    await payment.save();

    // Update order payment status
    order.payment = {
      status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'processing',
      method: paymentMethod,
      transactionId: '',
      paidAt: null
    };
    await order.save();

    res.status(201).json({
      success: true,
      message: "Payment record created",
      data: payment
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Process payment (simulate payment processing)
const processPayment = async (req, res) => {
  try {
    const { paymentId, transactionId, paymentReference, status } = req.body;
    const userId = req.body.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const payment = await paymentModel.findOne({ _id: paymentId, userId });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Update payment status
    if (status) {
      if (!['success', 'failed', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid payment status" });
      }
      payment.status = status;
    }

    if (transactionId) payment.transactionId = transactionId;
    if (paymentReference) payment.paymentReference = paymentReference;

    if (status === 'success') {
      payment.paidAt = new Date();
      
      // Update order payment status
      const order = await orderModel.findById(payment.orderId);
      if (order) {
        order.payment = {
          status: 'paid',
          method: payment.paymentMethod,
          transactionId: transactionId || payment.transactionId,
          paidAt: new Date()
        };
        await order.save();
      }
    } else if (status === 'failed') {
      payment.failureReason = req.body.failureReason || 'Payment failed';
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: `Payment ${status}`,
      data: payment
    });
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({
      success: false,
      message: "Error processing payment",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user payments
const getUserPayments = async (req, res) => {
  try {
    const userId = req.body.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const payments = await paymentModel
      .find({ userId })
      .populate('orderId', 'orderNumber status items')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await paymentModel.countDocuments({ userId });

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching user payments:", error);
    res.status(500).json({ success: false, message: "Error fetching payments" });
  }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.body.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const payment = await paymentModel
      .findOne({ _id: paymentId, userId })
      .populate('orderId');

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ success: false, message: "Error fetching payment" });
  }
};

// Admin: Get all payments
const getAllPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const maxLimit = 100;
    const actualLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * actualLimit;

    // Build query for filtering
    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }

    if (req.query.orderId) {
      query.orderId = req.query.orderId;
    }

    if (req.query.userId) {
      query.userId = req.query.userId;
    }

    if (req.query.orderNumber) {
      query.orderNumber = { $regex: req.query.orderNumber, $options: 'i' };
    }

    if (req.query.transactionId) {
      query.transactionId = { $regex: req.query.transactionId, $options: 'i' };
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    const payments = await paymentModel
      .find(query)
      .populate('orderId', 'orderNumber status items address')
      .sort({ createdAt: -1 })
      .limit(actualLimit)
      .skip(skip);

    const total = await paymentModel.countDocuments(query);

    // Calculate statistics
    const allPayments = await paymentModel.find({});
    const stats = {
      total: allPayments.length,
      totalAmount: allPayments.reduce((sum, p) => sum + (p.status === 'success' ? p.amount : 0), 0),
      success: allPayments.filter(p => p.status === 'success').length,
      failed: allPayments.filter(p => p.status === 'failed').length,
      pending: allPayments.filter(p => p.status === 'pending' || p.status === 'processing').length,
      refunded: allPayments.filter(p => p.status === 'refunded').length,
      byMethod: {}
    };

    // Group by payment method
    allPayments.forEach(payment => {
      if (!stats.byMethod[payment.paymentMethod]) {
        stats.byMethod[payment.paymentMethod] = {
          count: 0,
          amount: 0
        };
      }
      if (payment.status === 'success') {
        stats.byMethod[payment.paymentMethod].count++;
        stats.byMethod[payment.paymentMethod].amount += payment.amount;
      }
    });

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit: actualLimit,
        total,
        totalPages: Math.ceil(total / actualLimit),
        hasNext: page < Math.ceil(total / actualLimit),
        hasPrev: page > 1
      },
      statistics: stats
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ success: false, message: "Error fetching payments" });
  }
};

// Admin: Update payment status
const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status, transactionId, failureReason } = req.body;

    if (!status || !['pending', 'processing', 'success', 'failed', 'refunded', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required" });
    }

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    payment.status = status;
    if (transactionId) payment.transactionId = transactionId;
    if (failureReason) payment.failureReason = failureReason;

    if (status === 'success' && !payment.paidAt) {
      payment.paidAt = new Date();
      
      // Update order payment status
      const order = await orderModel.findById(payment.orderId);
      if (order) {
        order.payment = {
          status: 'paid',
          method: payment.paymentMethod,
          transactionId: transactionId || payment.transactionId,
          paidAt: new Date()
        };
        await order.save();
      }
    }

    if (status === 'refunded') {
      payment.refundDetails = {
        refundAmount: req.body.refundAmount || payment.amount,
        refundReason: req.body.refundReason || '',
        refundedAt: new Date(),
        refundTransactionId: req.body.refundTransactionId || ''
      };
      
      // Update order payment status
      const order = await orderModel.findById(payment.orderId);
      if (order) {
        order.payment.status = 'refunded';
        await order.save();
      }
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: "Payment status updated",
      data: payment
    });
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({ success: false, message: "Error updating payment status" });
  }
};

// Admin: Process refund
const processRefund = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refundAmount, refundReason, refundTransactionId } = req.body;

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (payment.status !== 'success') {
      return res.status(400).json({ 
        success: false, 
        message: "Only successful payments can be refunded" 
      });
    }

    payment.status = 'refunded';
    payment.refundDetails = {
      refundAmount: refundAmount || payment.amount,
      refundReason: refundReason || '',
      refundedAt: new Date(),
      refundTransactionId: refundTransactionId || ''
    };

    await payment.save();

    // Update order payment status
    const order = await orderModel.findById(payment.orderId);
    if (order) {
      order.payment.status = 'refunded';
      await order.save();
    }

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: payment
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    res.status(500).json({ success: false, message: "Error processing refund" });
  }
};

// Admin: Create payment manually
const adminCreatePayment = async (req, res) => {
  try {
    const { orderId, userId, amount, paymentMethod, paymentProvider, paymentDetails, status, transactionId } = req.body;

    if (!orderId || !userId || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: "orderId, userId, and amount are required" 
      });
    }

    // Check if order exists
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if payment already exists
    const existingPayment = await paymentModel.findOne({ orderId });
    if (existingPayment) {
      return res.status(409).json({ 
        success: false, 
        message: "Payment already exists for this order" 
      });
    }

    // Create payment record
    const payment = new paymentModel({
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: String(userId),
      amount: amount || order.finalAmount,
      currency: 'INR',
      paymentMethod: paymentMethod || 'cash_on_delivery',
      paymentProvider: paymentProvider || '',
      status: status || 'processing',
      paymentDetails: paymentDetails || {},
      transactionId: transactionId || '',
      paymentReference: ''
    });

    await payment.save();

    // Update order payment status
    order.payment = {
      status: status || 'processing',
      method: paymentMethod || 'cash_on_delivery',
      transactionId: transactionId || '',
      paidAt: status === 'success' ? new Date() : null
    };
    await order.save();

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: payment
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment"
    });
  }
};

// Admin: Delete payment
const adminDeletePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Check if payment is successful (usually shouldn't delete successful payments)
    if (payment.status === 'success') {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot delete successful payments" 
      });
    }

    // Update order payment status
    const order = await orderModel.findById(payment.orderId);
    if (order) {
      order.payment = {
        status: 'cancelled',
        method: payment.paymentMethod,
        transactionId: '',
        paidAt: null
      };
      await order.save();
    }

    await paymentModel.findByIdAndDelete(paymentId);

    res.status(200).json({
      success: true,
      message: "Payment deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ success: false, message: "Error deleting payment" });
  }
};

export {
  createPayment,
  processPayment,
  getUserPayments,
  getPaymentById,
  getAllPayments,
  updatePaymentStatus,
  processRefund,
  adminCreatePayment,
  adminDeletePayment
};

