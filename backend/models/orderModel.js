import mongoose from "mongoose";
import { encryptField, decryptField } from "../utils/encryptionUtils.js";

const orderItemSchema = new mongoose.Schema({
  foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'food', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  image: { type: String }
}, { _id: false });

const orderStatusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  message: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'system' } // 'system', 'admin', 'delivery_person'
}, { _id: false });

// Encrypt address fields before saving
const encryptAddressFields = (address) => {
  if (!address || typeof address !== 'object') return address;
  
  const encrypted = { ...address };
  if (encrypted.phone && !encrypted.phone.includes(':')) {
    encrypted.phone = encryptField(encrypted.phone);
  }
  if (encrypted.email && !encrypted.email.includes(':')) {
    encrypted.email = encryptField(encrypted.email);
  }
  if (encrypted.addressLine1 && !encrypted.addressLine1.includes(':')) {
    encrypted.addressLine1 = encryptField(encrypted.addressLine1);
  }
  if (encrypted.pincode && !encrypted.pincode.includes(':')) {
    encrypted.pincode = encryptField(encrypted.pincode);
  }
  return encrypted;
};

// Decrypt address fields after retrieving
const decryptAddressFields = (address) => {
  if (!address || typeof address !== 'object') return address;
  
  const decrypted = { ...address };
  if (decrypted.phone) decrypted.phone = decryptField(decrypted.phone);
  if (decrypted.email) decrypted.email = decryptField(decrypted.email);
  if (decrypted.addressLine1) decrypted.addressLine1 = decryptField(decrypted.addressLine1);
  if (decrypted.pincode) decrypted.pincode = decryptField(decrypted.pincode);
  return decrypted;
};

const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  orderNumber: { type: String, unique: true, required: true },
  items: [orderItemSchema],
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'restaurant', default: null },
  amount: { type: Number, required: true },
  deliveryFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  offersApplied: [{
    offerId: { type: String },
    title: { type: String },
    type: { type: String },
    discount: { type: Number }
  }],
  finalAmount: { type: Number, required: true },
  address: { 
    type: { type: String, default: 'home' },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: '' },
    landmark: { type: String, default: '' },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
    index: true
  },
  statusHistory: [orderStatusHistorySchema],
  payment: { 
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    method: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    paidAt: { type: Date }
  },
  deliveryPersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'deliveryPerson', default: null },
  estimatedDeliveryTime: { type: Date },
  deliveredAt: { type: Date },
  date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save hook for status history, timestamps, and encryption
orderSchema.pre('save', async function(next) {
  // Generate order number if not provided (fallback)
  if (!this.orderNumber) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.orderNumber = `ORD${timestamp}${random}`;
  }
  
  // Encrypt address fields if not already encrypted
  if (this.address) {
    this.address = encryptAddressFields(this.address);
  }
  
  // Add status to history
  if (this.isModified('status')) {
    if (!this.statusHistory) {
      this.statusHistory = [];
    }
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      updatedBy: 'system'
    });
  }
  
  this.updatedAt = Date.now();
  next();
});

// Post-find hook to decrypt address fields
orderSchema.post('find', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => {
      if (doc.address) {
        doc.address = decryptAddressFields(doc.address);
      }
    });
  }
});

orderSchema.post('findOne', function(doc) {
  if (doc && doc.address) {
    doc.address = decryptAddressFields(doc.address);
  }
});

orderSchema.index({ userId: 1, date: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ restaurantId: 1, status: 1 });

const orderModel = mongoose.models.order || mongoose.model("order", orderSchema);

export default orderModel;
