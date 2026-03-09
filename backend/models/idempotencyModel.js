import mongoose from "mongoose";

const idempotencySchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true,
    index: true 
  },
  userId: { 
    type: String, 
    required: true,
    index: true 
  },
  endpoint: { 
    type: String, 
    required: true 
  },
  response: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  statusCode: { 
    type: Number, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 86400 // 24 hours in seconds (TTL index - MongoDB will auto-delete after expiration)
  }
});

// Compound index for faster lookups (key + userId + endpoint for scoped uniqueness)
idempotencySchema.index({ key: 1, userId: 1, endpoint: 1 }, { unique: true });

const idempotencyModel =
  mongoose.models.idempotency || mongoose.model("idempotency", idempotencySchema);

export default idempotencyModel;

