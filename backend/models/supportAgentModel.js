import mongoose from "mongoose";

const supportAgentSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true, 
    unique: true,
    index: true 
  },
  agentName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  department: { 
    type: String, 
    enum: ['general', 'orders', 'payments', 'delivery', 'technical', 'refunds'], 
    default: 'general' 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'busy', 'away'], 
    default: 'active',
    index: true 
  },
  maxTickets: { type: Number, default: 10 }, // Maximum concurrent tickets
  currentTickets: { type: Number, default: 0 },
  totalTicketsHandled: { type: Number, default: 0 },
  totalResolved: { type: Number, default: 0 },
  averageResponseTime: { type: Number, default: 0 }, // in minutes
  averageResolutionTime: { type: Number, default: 0 }, // in hours
  rating: { type: Number, default: 0, min: 0, max: 5 }, // Average customer rating
  totalRatings: { type: Number, default: 0 },
  skills: [{ type: String }], // e.g., ['order_management', 'refunds', 'technical']
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '18:00' }
  },
  isAvailable: { type: Boolean, default: true, index: true },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

supportAgentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if agent can take more tickets
supportAgentSchema.methods.canTakeTicket = function() {
  return this.status === 'active' && 
         this.isAvailable && 
         this.currentTickets < this.maxTickets;
};

// Method to update agent statistics
supportAgentSchema.methods.updateStats = async function(responseTime, resolutionTime, rating) {
  this.totalTicketsHandled += 1;
  if (resolutionTime) {
    this.totalResolved += 1;
    // Update average resolution time
    const totalTime = this.averageResolutionTime * (this.totalResolved - 1) + resolutionTime;
    this.averageResolutionTime = totalTime / this.totalResolved;
  }
  if (responseTime) {
    // Update average response time
    const totalResponseTime = this.averageResponseTime * this.totalTicketsHandled + responseTime;
    this.averageResponseTime = totalResponseTime / (this.totalTicketsHandled + 1);
  }
  if (rating) {
    // Update average rating
    const totalRating = this.rating * this.totalRatings + rating;
    this.totalRatings += 1;
    this.rating = totalRating / this.totalRatings;
  }
  await this.save();
};

const SupportAgent = mongoose.models.supportAgent || mongoose.model("supportAgent", supportAgentSchema);

export default SupportAgent;

