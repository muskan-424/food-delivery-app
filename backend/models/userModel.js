import mongoose from "mongoose";
import { encryptField, decryptField } from "../utils/encryptionUtils.js";

const addressSchema = new mongoose.Schema({
  addressId: { type: String, required: true },
  type: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
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
  isDefault: { type: Boolean, default: false },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    role: { type: String, default: "user" },
    cartData: { type: Object, default: {} },
    addresses: [addressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'food' }],
    // User management fields
    isBlocked: { type: Boolean, default: false, index: true },
    blockedAt: { type: Date },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    blockReason: { type: String },
    warnings: { type: Number, default: 0, min: 0, max: 3 },
    warningHistory: [{
      warningNumber: { type: Number },
      reason: { type: String, required: true },
      givenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
      givenAt: { type: Date, default: Date.now },
      activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'userActivity' }
    }],
    lastLoginAt: { type: Date },
    lastActivityAt: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lastLoginAttempt: { type: Date },
    accountLockedUntil: { type: Date }, // Account lockout timestamp
    // Two-Factor Authentication
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String }, // TOTP secret
    twoFactorBackupCodes: [{ type: String }], // Backup codes for 2FA
    // Password reset
    passwordResetRequired: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
    // Session management
    activeSessions: [{ type: String }], // Array of active refresh token IDs
    // GDPR Compliance
    anonymized: { type: Boolean, default: false },
    anonymizedAt: { type: Date },
    dataExportRequested: { type: Boolean, default: false },
    dataExportRequestedAt: { type: Date },
    dataDeletionRequested: { type: Boolean, default: false },
    dataDeletionRequestedAt: { type: Date },
    // Admin creation tracking
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' }, // For tracking who created admin accounts
    ipAddress: { type: String }, // IP address during registration
    userAgent: { type: String }, // User agent during registration
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

// Encrypt sensitive fields before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Encrypt phone number if it's not already encrypted
  if (this.phone && !this.phone.includes(':')) {
    this.phone = encryptField(this.phone);
  }
  
  // Encrypt addresses
  if (this.addresses && Array.isArray(this.addresses)) {
    this.addresses = this.addresses.map(addr => {
      if (addr.phone && !addr.phone.includes(':')) {
        addr.phone = encryptField(addr.phone);
      }
      if (addr.email && !addr.email.includes(':')) {
        addr.email = encryptField(addr.email);
      }
      if (addr.addressLine1 && !addr.addressLine1.includes(':')) {
        addr.addressLine1 = encryptField(addr.addressLine1);
      }
      if (addr.pincode && !addr.pincode.includes(':')) {
        addr.pincode = encryptField(addr.pincode);
      }
      return addr;
    });
  }
  
  next();
});

// Decrypt sensitive fields after retrieving
userSchema.post('find', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => {
      if (doc.phone) doc.phone = decryptField(doc.phone);
      if (doc.addresses && Array.isArray(doc.addresses)) {
        doc.addresses = doc.addresses.map(addr => ({
          ...addr,
          phone: addr.phone ? decryptField(addr.phone) : addr.phone,
          email: addr.email ? decryptField(addr.email) : addr.email,
          addressLine1: addr.addressLine1 ? decryptField(addr.addressLine1) : addr.addressLine1,
          pincode: addr.pincode ? decryptField(addr.pincode) : addr.pincode
        }));
      }
    });
  }
});

userSchema.post('findOne', function(doc) {
  if (doc) {
    if (doc.phone) doc.phone = decryptField(doc.phone);
    if (doc.addresses && Array.isArray(doc.addresses)) {
      doc.addresses = doc.addresses.map(addr => ({
        ...addr,
        phone: addr.phone ? decryptField(addr.phone) : addr.phone,
        email: addr.email ? decryptField(addr.email) : addr.email,
        addressLine1: addr.addressLine1 ? decryptField(addr.addressLine1) : addr.addressLine1,
        pincode: addr.pincode ? decryptField(addr.pincode) : addr.pincode
      }));
    }
  }
});

const userModel = mongoose.model.user || mongoose.model("user", userSchema);
export default userModel;
