import mongoose from "mongoose";

// Conversation message schema
const messageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderType: { type: String, enum: ['user', 'agent', 'system'], required: true },
  senderName: { type: String, required: true },
  message: { type: String, required: true },
  attachments: [{ 
    type: String, // URLs to uploaded files
    filename: String 
  }],
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Support ticket schema with enhanced features
const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { 
    type: String, 
    unique: true, 
    required: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true, 
    index: true 
  },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'order', 
    default: null,
    index: true 
  },
  subject: { type: String, required: true, index: true },
  category: { 
    type: String, 
    enum: ['order', 'payment', 'delivery', 'account', 'refund', 'technical', 'other'], 
    default: 'other',
    index: true 
  },
  status: { 
    type: String, 
    enum: ['open', 'assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated'], 
    default: 'open',
    index: true 
  },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'urgent'], 
    default: 'medium',
    index: true 
  },
  // Agent assignment
  assignedTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'supportAgent',
    default: null,
    index: true 
  },
  assignedAt: { type: Date },
  assignedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user' 
  },
  // Auto-assignment flag
  autoAssigned: { type: Boolean, default: false },
  // Conversation thread
  messages: [messageSchema],
  // First message (for quick reference)
  initialMessage: { type: String, required: true },
  // Response tracking
  firstResponseTime: { type: Date }, // When agent first responded
  firstResponseDuration: { type: Number }, // Minutes from creation to first response
  resolutionTime: { type: Date }, // When ticket was resolved
  resolutionDuration: { type: Number }, // Hours from creation to resolution
  // Escalation
  escalated: { type: Boolean, default: false },
  escalatedAt: { type: Date },
  escalatedTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'supportAgent' 
  },
  escalationReason: { type: String },
  // Customer satisfaction
  customerRating: { type: Number, min: 1, max: 5 },
  customerFeedback: { type: String },
  ratedAt: { type: Date },
  // Tags for better organization
  tags: [{ type: String }],
  // Internal notes (visible only to agents/admins)
  internalNotes: [{ 
    note: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    addedAt: { type: Date, default: Date.now }
  }],
  // SLA tracking
  slaDeadline: { type: Date }, // Based on priority
  slaBreached: { type: Boolean, default: false },
  // Follow-up
  requiresFollowUp: { type: Boolean, default: false },
  followUpDate: { type: Date },
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  closedAt: { type: Date }
});

// Generate unique ticket number before saving
supportTicketSchema.pre('save', async function(next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model('supportTicket').countDocuments() || 0;
    this.ticketNumber = `TKT-${Date.now()}-${String(count + 1).padStart(6, '0')}`;
  }
  
  // Calculate SLA deadline based on priority
  if (!this.slaDeadline && this.priority) {
    const hours = {
      'urgent': 2,
      'high': 4,
      'medium': 8,
      'low': 24
    };
    this.slaDeadline = new Date(Date.now() + (hours[this.priority] || 8) * 60 * 60 * 1000);
  }
  
  // Check if SLA is breached
  if (this.slaDeadline && new Date() > this.slaDeadline && this.status !== 'resolved' && this.status !== 'closed') {
    this.slaBreached = true;
  }
  
  this.updatedAt = Date.now();
  next();
});

// Method to add message to conversation
supportTicketSchema.methods.addMessage = function(senderId, senderType, senderName, message, attachments = []) {
  this.messages.push({
    senderId,
    senderType,
    senderName,
    message,
    attachments
  });
  
  // Update first response time if this is the first agent response
  if (senderType === 'agent' && !this.firstResponseTime) {
    this.firstResponseTime = new Date();
    const duration = (this.firstResponseTime - this.createdAt) / (1000 * 60); // minutes
    this.firstResponseDuration = Math.round(duration);
  }
  
  // Update status
  if (this.status === 'open' && senderType === 'agent') {
    this.status = 'in_progress';
  } else if (senderType === 'user' && this.status === 'in_progress') {
    this.status = 'waiting_customer';
  } else if (senderType === 'agent' && this.status === 'waiting_customer') {
    this.status = 'in_progress';
  }
  
  return this.save();
};

// Method to mark as resolved
supportTicketSchema.methods.markResolved = function() {
  this.status = 'resolved';
  this.resolutionTime = new Date();
  const duration = (this.resolutionTime - this.createdAt) / (1000 * 60 * 60); // hours
  this.resolutionDuration = Math.round(duration * 100) / 100; // Round to 2 decimals
  return this.save();
};

// Method to escalate ticket
supportTicketSchema.methods.escalate = function(escalatedTo, reason) {
  this.escalated = true;
  this.escalatedAt = new Date();
  this.escalatedTo = escalatedTo;
  this.escalationReason = reason;
  this.status = 'escalated';
  this.priority = 'urgent';
  return this.save();
};

const SupportTicket = mongoose.models.supportTicket || mongoose.model("supportTicket", supportTicketSchema);

export default SupportTicket;

