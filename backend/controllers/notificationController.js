import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
// Note: For production, use proper email/SMS services like Nodemailer, Twilio, etc.

// Send order confirmation notification
const sendOrderConfirmation = async (orderId) => {
  try {
    const order = await orderModel.findById(orderId).populate('userId', 'email name phone');
    if (!order) return;

    const user = order.userId;
    
    // In production, send actual email/SMS
    console.log(`Order Confirmation - Order #${order.orderNumber} placed for ${user.email}`);
    
    // Email notification (implement with Nodemailer)
    // await sendEmail(user.email, 'Order Confirmed', `Your order #${order.orderNumber} has been confirmed`);
    
    // SMS notification (implement with Twilio)
    // if (user.phone) {
    //   await sendSMS(user.phone, `Your order #${order.orderNumber} has been confirmed`);
    // }
  } catch (error) {
    console.error('Error sending order confirmation:', error);
  }
};

// Send order status update notification
const sendOrderStatusUpdate = async (orderId, status) => {
  try {
    const order = await orderModel.findById(orderId).populate('userId', 'email name phone');
    if (!order) return;

    const user = order.userId;
    const statusMessages = {
      'confirmed': 'Your order has been confirmed',
      'preparing': 'Your order is being prepared',
      'ready': 'Your order is ready',
      'out_for_delivery': 'Your order is out for delivery',
      'delivered': 'Your order has been delivered'
    };

    const message = statusMessages[status] || `Your order status has been updated to ${status}`;
    
    console.log(`Order Status Update - Order #${order.orderNumber}: ${message} to ${user.email}`);
    
    // In production, send actual notifications
    // await sendEmail(user.email, 'Order Status Update', message);
    // if (user.phone) await sendSMS(user.phone, message);
  } catch (error) {
    console.error('Error sending status update:', error);
  }
};

// Send delivery assigned notification
const sendDeliveryAssigned = async (orderId) => {
  try {
    const order = await orderModel.findById(orderId).populate('userId', 'email name phone');
    if (!order) return;

    const user = order.userId;
    console.log(`Delivery Assigned - Order #${order.orderNumber} assigned to delivery person`);
    
    // In production, send actual notifications
    // await sendEmail(user.email, 'Delivery Assigned', `Your order #${order.orderNumber} has been assigned to a delivery person`);
  } catch (error) {
    console.error('Error sending delivery assigned notification:', error);
  }
};

export { sendOrderConfirmation, sendOrderStatusUpdate, sendDeliveryAssigned };

