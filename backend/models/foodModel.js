import mongoose from "mongoose";

const foodSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  category: { type: String, required: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'restaurant', default: null },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalRatings: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
  isVeg: { type: Boolean, default: true },
  ingredients: [{ type: String }],
  allergens: [{ type: String }],
  nutritionalInfo: {
    calories: { type: Number },
    protein: { type: Number },
    carbs: { type: Number },
    fat: { type: Number }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

foodSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

foodSchema.index({ restaurantId: 1 });
foodSchema.index({ category: 1 });
foodSchema.index({ rating: -1 });

const foodModel = mongoose.models.food || mongoose.model("food", foodSchema);

export default foodModel;
