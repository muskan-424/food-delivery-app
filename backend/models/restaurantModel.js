import mongoose from "mongoose";

const weeklyHourSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    open: { type: String, default: "09:00" },
    close: { type: String, default: "22:00" },
    closed: { type: Boolean, default: false },
  },
  { _id: false }
);

const hourExceptionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    closed: { type: Boolean, default: true },
    open: { type: String },
    close: { type: String },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const deliveryZonePointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const deliveryZoneSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    name: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    polygon: { type: [deliveryZonePointSchema], default: [] }, // ring of [lat,lng] points
  },
  { _id: false }
);

const kycHistorySchema = new mongoose.Schema(
  {
    fromStatus: {
      type: String,
      enum: ["pending", "submitted", "approved", "rejected", ""],
      default: "",
    },
    toStatus: {
      type: String,
      enum: ["pending", "submitted", "approved", "rejected"],
      required: true,
    },
    note: { type: String, default: "" },
    documentUrl: { type: String, default: "" },
    changedBy: { type: String, default: "" },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
  /** Payout ops: flag rows below this estimated net in batch preview (0 = no threshold) */
  minimumPayoutAmount: { type: Number, default: 0, min: 0 },
  /** If set (>0), delivery address coordinates must fall within this radius (km) of restaurant address */
  deliveryRadiusKm: { type: Number, default: null },
  /** Optional polygon service zones; when active zones exist, checkout validates against zones first */
  deliveryZones: { type: [deliveryZoneSchema], default: [] },
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
  weeklyHours: { type: [weeklyHourSchema], default: [] },
  hourExceptions: { type: [hourExceptionSchema], default: [] },
  /** Platform commission on net item subtotal (0–100), snapshot on each order */
  commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  /** Default GST/VAT % for tax disclosure snapshot on orders (0–100) */
  defaultTaxRatePercent: { type: Number, default: 0, min: 0, max: 100 },
  /** When true and defaultTaxRatePercent > 0, menu prices in DB are exclusive but customers pay gross (tax included in displayed/charged line prices). */
  menuPricesIncludeTax: { type: Boolean, default: false },
  /** Phase 8 — onboarding / compliance; public listing & orders use approved only when gated */
  kycStatus: {
    type: String,
    enum: ["pending", "submitted", "approved", "rejected"],
    default: "approved",
  },
  kycSubmittedAt: { type: Date, default: null },
  kycReviewedAt: { type: Date, default: null },
  kycReviewNote: { type: String, default: "" },
  /** Optional document URL/path until object storage (Phase 9) */
  kycDocumentUrl: { type: String, default: "" },
  /** KYC review audit trail (latest 100 entries kept) */
  kycHistory: { type: [kycHistorySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

restaurantSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const restaurantModel = mongoose.models.restaurant || mongoose.model("restaurant", restaurantSchema);
export default restaurantModel;

