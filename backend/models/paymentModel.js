import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'order', 
    required: true, 
    index: true 
  },
  orderNumber: { 
    type: String, 
    required: true, 
    index: true 
  },
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  paymentMethod: { 
    type: String, 
    enum: [
      'upi',
      'netbanking',
      'credit_card',
      'debit_card',
      'wallet',
      'cash_on_delivery',
      'other'
    ],
    required: true,
    index: true
  },
  paymentProvider: { 
    type: String, 
    default: '' // e.g., 'razorpay', 'paytm', 'phonepe', 'gpay', etc.
  },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'success', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    required: true,
    index: true
  },
  transactionId: { 
    type: String, 
    default: '',
    index: true 
  },
  paymentReference: { 
    type: String, 
    default: '' // UPI reference, transaction reference, etc.
  },
  // Payment method specific details
  paymentDetails: {
    upiId: { type: String, default: '' },
    bankName: { type: String, default: '' },
    cardLast4: { type: String, default: '' },
    cardType: { type: String, default: '' }, // Visa, Mastercard, RuPay
    walletName: { type: String, default: '' }, // Paytm, PhonePe, etc.
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' }
  },
  failureReason: { 
    type: String, 
    default: '' 
  },
  refundDetails: {
    refundAmount: { type: Number, default: 0 },
    refundReason: { type: String, default: '' },
    refundedAt: { type: Date },
    refundTransactionId: { type: String, default: '' }
  },
  paidAt: { 
    type: Date 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for efficient queries
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ paymentMethod: 1, status: 1 });
paymentSchema.index({ transactionId: 1 });

// Pre-save hook to update updatedAt
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const paymentModel = mongoose.models.payment || mongoose.model("payment", paymentSchema);

export default paymentModel;

