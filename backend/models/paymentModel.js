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
      'razorpay',
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
  /** Client-supplied key for safe retries (pairs with userId) */
  clientIdempotencyKey: {
    type: String,
    default: '',
  },
  /** Provider object id (e.g. Stripe PaymentIntent, Razorpay order_id) for webhooks */
  providerPaymentId: {
    type: String,
    default: '',
    index: true,
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
    refundTransactionId: { type: String, default: '' },
    provider: {
      provider: { type: String, default: "" },
      status: { type: String, default: "" },
      providerPaymentId: { type: String, default: "" },
    },
  },
  /** Razorpay checkout session throttling state for unpaid retries */
  razorpayCheckoutControl: {
    windowStartedAt: { type: Date },
    windowAttempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    cooldownUntil: { type: Date },
  },
  /** Snapshot for reporting / reconciliation */
  breakdown: {
    itemsSubtotal: { type: Number, default: 0 },
    deliveryFeeAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    tipAmount: { type: Number, default: 0 },
    serviceFeeAmount: { type: Number, default: 0 },
    loyaltyRedeemInr: { type: Number, default: 0 },
  },
  /** Set when payment-received receipt email was sent (idempotency) */
  receiptEmailSentAt: { type: Date, default: null },
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
paymentSchema.index(
  { userId: 1, clientIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientIdempotencyKey: { $exists: true, $nin: [null, ""] },
    },
  }
);

// Pre-save hook to update updatedAt
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const paymentModel = mongoose.models.payment || mongoose.model("payment", paymentSchema);

export default paymentModel;

