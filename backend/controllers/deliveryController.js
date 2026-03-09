import { deliveryPersonModel, deliveryAssignmentModel } from "../models/deliveryModel.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";

// Create delivery person (Admin)
const createDeliveryPerson = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      vehicleType,
      vehicleNumber,
      licenseNumber
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email, phone, and password are required" 
      });
    }

    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const deliveryPerson = new deliveryPersonModel({
      name,
      email,
      phone,
      password: hashedPassword,
      vehicleType: vehicleType || 'bike',
      vehicleNumber: vehicleNumber || '',
      licenseNumber: licenseNumber || ''
    });

    await deliveryPerson.save();

    res.status(201).json({ 
      success: true, 
      message: "Delivery person created successfully",
      data: { ...deliveryPerson.toObject(), password: undefined }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }
    console.log(error);
    res.status(500).json({ success: false, message: "Error creating delivery person" });
  }
};

// Assign delivery person to order (Admin)
const assignDelivery = async (req, res) => {
  try {
    const { orderId, deliveryPersonId } = req.body;

    if (!orderId || !deliveryPersonId) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID and delivery person ID are required" 
      });
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot assign delivery to completed or cancelled order" 
      });
    }

    const deliveryPerson = await deliveryPersonModel.findById(deliveryPersonId);
    if (!deliveryPerson) {
      return res.status(404).json({ success: false, message: "Delivery person not found" });
    }

    if (!deliveryPerson.isAvailable) {
      return res.status(400).json({ 
        success: false, 
        message: "Delivery person is not available" 
      });
    }

    // Check if already assigned
    const existingAssignment = await deliveryAssignmentModel.findOne({ orderId });
    if (existingAssignment) {
      return res.status(409).json({ 
        success: false, 
        message: "Order already has a delivery assignment" 
      });
    }

    // Calculate estimated delivery time (30-45 minutes from now)
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + 40);

    const assignment = new deliveryAssignmentModel({
      orderId,
      deliveryPersonId,
      status: 'assigned',
      estimatedDeliveryTime,
      deliveryAddress: {
        type: order.address.type,
        address: `${order.address.addressLine1}, ${order.address.city}, ${order.address.state} ${order.address.pincode}`,
        coordinates: order.address.coordinates
      }
    });

    await assignment.save();

    // Update order
    order.deliveryPersonId = deliveryPersonId;
    order.status = 'out_for_delivery';
    order.estimatedDeliveryTime = estimatedDeliveryTime;
    await order.save();

    // Update delivery person
    deliveryPerson.isAvailable = false;
    deliveryPerson.totalDeliveries += 1;
    await deliveryPerson.save();

    res.status(201).json({ 
      success: true, 
      message: "Delivery assigned successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error assigning delivery" });
  }
};

// Update delivery location (Delivery Person)
const updateDeliveryLocation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { lat, lng } = req.body;
    const deliveryPersonId = req.body.userId; // Assuming delivery person ID from auth

    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        message: "Latitude and longitude are required" 
      });
    }

    const assignment = await deliveryAssignmentModel.findOne({ 
      orderId,
      deliveryPersonId 
    });

    if (!assignment) {
      return res.status(404).json({ 
        success: false, 
        message: "Delivery assignment not found" 
      });
    }

    assignment.currentLocation = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      updatedAt: new Date()
    };

    await assignment.save();

    res.status(200).json({ 
      success: true, 
      message: "Location updated successfully",
      data: assignment.currentLocation
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating location" });
  }
};

// Get delivery assignments for delivery person
const getMyDeliveries = async (req, res) => {
  try {
    const deliveryPersonId = req.body.userId;
    const status = req.query.status;

    const query = { deliveryPersonId };
    if (status) {
      query.status = status;
    }

    const assignments = await deliveryAssignmentModel
      .find(query)
      .populate('orderId')
      .sort({ assignedAt: -1 });

    res.status(200).json({ 
      success: true, 
      data: assignments
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching deliveries" });
  }
};

// Delivery person: Accept delivery
const acceptDelivery = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const deliveryPersonId = req.body.userId;

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId,
      status: 'assigned'
    });

    if (!assignment) {
      return res.status(404).json({ 
        success: false, 
        message: "Assignment not found or already processed" 
      });
    }

    assignment.status = 'accepted';
    assignment.acceptedAt = new Date();
    await assignment.save();

    res.status(200).json({ 
      success: true, 
      message: "Delivery accepted successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error accepting delivery" });
  }
};

// Delivery person: Mark as picked up
const markPickedUp = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const deliveryPersonId = req.body.userId;

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    assignment.status = 'picked_up';
    assignment.pickedUpAt = new Date();
    await assignment.save();

    // Update order status
    await orderModel.findByIdAndUpdate(assignment.orderId, {
      status: 'out_for_delivery'
    });

    res.status(200).json({ 
      success: true, 
      message: "Marked as picked up successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating status" });
  }
};

// Delivery person: Mark as delivered
const markDelivered = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const deliveryPersonId = req.body.userId;

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    assignment.status = 'delivered';
    assignment.deliveredAt = new Date();
    await assignment.save();

    // Update order status
    const order = await orderModel.findById(assignment.orderId);
    if (order) {
      order.status = 'delivered';
      order.deliveredAt = new Date();
      await order.save();
    }

    // Mark delivery person as available
    const deliveryPerson = await deliveryPersonModel.findById(deliveryPersonId);
    if (deliveryPerson) {
      deliveryPerson.isAvailable = true;
      await deliveryPerson.save();
    }

    res.status(200).json({ 
      success: true, 
      message: "Marked as delivered successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating status" });
  }
};

export { 
  createDeliveryPerson, 
  assignDelivery, 
  updateDeliveryLocation, 
  getMyDeliveries,
  acceptDelivery,
  markPickedUp,
  markDelivered
};

