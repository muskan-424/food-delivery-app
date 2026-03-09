import mongoose from "mongoose";

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  cuisine: { type: String, required: true },
  image: { type: String, default: '' },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalRatings: { type: Number, default: 0 },
  deliveryTime: { type: String, default: '30-45 min' },
  deliveryFee: { type: Number, default: 0 },
  minimumOrder: { type: Number, default: 0 },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  isActive: { type: Boolean, default: true },
  isOpen: { type: Boolean, default: true },
  openingTime: { type: String, default: '10:00 AM' },
  closingTime: { type: String, default: '10:00 PM' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

restaurantSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const restaurantModel = mongoose.models.restaurant || mongoose.model("restaurant", restaurantSchema);
export default restaurantModel;

