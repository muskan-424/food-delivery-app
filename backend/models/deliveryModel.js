import mongoose from "mongoose";

const deliveryPersonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  vehicleType: { type: String, enum: ['bike', 'cycle', 'car'], default: 'bike' },
  vehicleNumber: { type: String, default: '' },
  licenseNumber: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String }
  },
  totalDeliveries: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  createdAt: { type: Date, default: Date.now }
});

const deliveryAssignmentSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order', required: true, unique: true },
  deliveryPersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'deliveryPerson', required: true },
  status: { 
    type: String, 
    enum: ['assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'cancelled'],
    default: 'assigned'
  },
  assignedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date },
  pickedUpAt: { type: Date },
  deliveredAt: { type: Date },
  estimatedDeliveryTime: { type: Date },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
    updatedAt: { type: Date }
  },
  deliveryAddress: {
    type: { type: String },
    address: { type: String, required: true },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  }
});

deliveryAssignmentSchema.index({ orderId: 1 });
deliveryAssignmentSchema.index({ deliveryPersonId: 1, status: 1 });

const deliveryPersonModel = mongoose.models.deliveryPerson || mongoose.model("deliveryPerson", deliveryPersonSchema);
const deliveryAssignmentModel = mongoose.models.deliveryAssignment || mongoose.model("deliveryAssignment", deliveryAssignmentSchema);

export { deliveryPersonModel, deliveryAssignmentModel };

