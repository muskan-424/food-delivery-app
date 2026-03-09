import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import { deliveryAssignmentModel } from "../models/deliveryModel.js";

// Get order tracking details
const getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.body.userId;

    const order = await orderModel.findOne({ 
      _id: orderId, 
      userId 
    }).populate('restaurantId', 'name image').populate('deliveryPersonId', 'name phone');

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Get delivery assignment if exists
    let deliveryAssignment = null;
    if (order.deliveryPersonId) {
      deliveryAssignment = await deliveryAssignmentModel.findOne({ orderId });
    }

    // Calculate estimated time remaining
    let estimatedTimeRemaining = null;
    if (order.estimatedDeliveryTime) {
      const now = new Date();
      const diff = order.estimatedDeliveryTime - now;
      if (diff > 0) {
        estimatedTimeRemaining = Math.ceil(diff / 60000); // minutes
      }
    }

    res.status(200).json({
      success: true,
      data: {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          statusHistory: order.statusHistory || [],
          items: order.items,
          amount: order.finalAmount,
          address: order.address,
          estimatedDeliveryTime: order.estimatedDeliveryTime,
          estimatedTimeRemaining,
          deliveredAt: order.deliveredAt
        },
        restaurant: order.restaurantId,
        deliveryPerson: order.deliveryPersonId,
        deliveryTracking: deliveryAssignment ? {
          status: deliveryAssignment.status,
          currentLocation: deliveryAssignment.currentLocation,
          assignedAt: deliveryAssignment.assignedAt,
          acceptedAt: deliveryAssignment.acceptedAt,
          pickedUpAt: deliveryAssignment.pickedUpAt,
          deliveredAt: deliveryAssignment.deliveredAt
        } : null
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching order tracking" });
  }
};

// Update order status (Admin/Delivery)
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, message } = req.body;
    const userId = req.body.userId;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check permissions (admin or delivery person assigned to order)
    // This should be handled by middleware, but adding basic check
    const user = await userModel.findById(userId);
    const isAdmin = user?.role === 'admin';
    const isDeliveryPerson = order.deliveryPersonId?.toString() === userId;

    if (!isAdmin && !isDeliveryPerson) {
      return res.status(403).json({ success: false, message: "Not authorized to update order status" });
    }

    order.status = status;
    if (status === 'delivered') {
      order.deliveredAt = new Date();
    }

    // Status history is handled by pre-save hook, but we can add message
    if (message) {
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({
        status,
        message,
        timestamp: new Date(),
        updatedBy: isAdmin ? 'admin' : 'delivery_person'
      });
    }

    await order.save();

    // Update delivery assignment if exists
    if (order.deliveryPersonId) {
      const deliveryAssignment = await deliveryAssignmentModel.findOne({ orderId });
      if (deliveryAssignment) {
        if (status === 'out_for_delivery' && !deliveryAssignment.pickedUpAt) {
          deliveryAssignment.status = 'picked_up';
          deliveryAssignment.pickedUpAt = new Date();
        } else if (status === 'delivered') {
          deliveryAssignment.status = 'delivered';
          deliveryAssignment.deliveredAt = new Date();
        } else {
          deliveryAssignment.status = status;
        }
        await deliveryAssignment.save();
      }
    }

    res.status(200).json({ 
      success: true, 
      message: "Order status updated successfully",
      data: {
        orderId: order._id,
        status: order.status,
        statusHistory: order.statusHistory
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating order status" });
  }
};

// Get order status timeline
const getOrderTimeline = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.body.userId;

    const order = await orderModel.findOne({ 
      _id: orderId, 
      userId 
    }).select('statusHistory status createdAt estimatedDeliveryTime deliveredAt');

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        currentStatus: order.status,
        timeline: order.statusHistory || [],
        createdAt: order.createdAt,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        deliveredAt: order.deliveredAt
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching order timeline" });
  }
};

export { getOrderTracking, updateOrderStatus, getOrderTimeline };

