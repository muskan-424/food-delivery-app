import { body, param, validationResult } from "express-validator";

import { sendValidationError } from "../utils/apiResponse.js";

// Validation error handler middleware
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendValidationError(res, req, errors.array());
  }
  next();
};

// User registration validation
export const validateRegister = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter valid email")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage("Password must contain at least one special character"),
  body("referralCode")
    .optional()
    .trim()
    .isLength({ min: 4, max: 16 })
    .withMessage("Referral code must be 4–16 characters"),
  handleValidationErrors
];

// User login validation
export const validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter valid email")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required"),
  handleValidationErrors
];

// Food item validation
export const validateFood = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Food name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Food name must be between 2 and 100 characters"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ min: 10, max: 500 })
    .withMessage("Description must be between 10 and 500 characters"),
  body("price")
    .notEmpty()
    .withMessage("Price is required")
    .isFloat({ min: 0.01 })
    .withMessage("Price must be a positive number"),
  body("category")
    .trim()
    .notEmpty()
    .withMessage("Category is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Category must be between 2 and 50 characters"),
  handleValidationErrors
];

// Cart operations validation
export const validateCart = [
  body("itemId")
    .notEmpty()
    .withMessage("Item ID is required")
    .isMongoId()
    .withMessage("Invalid item ID format"),
  handleValidationErrors
];

// Order placement validation
export const validateOrder = [
  body("items")
    .isArray({ min: 1 })
    .withMessage("Items array is required and must contain at least one item"),
  body("items.*.name")
    .notEmpty()
    .withMessage("Item name is required"),
  body("items.*.price")
    .isFloat({ min: 0.01 })
    .withMessage("Item price must be a positive number"),
  body("items.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Item quantity must be a positive integer"),
  body("amount")
    .notEmpty()
    .withMessage("Total amount is required")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be a positive number"),
  body("address")
    .isObject()
    .withMessage("Address is required")
    .custom((value) => {
      // Check for required address fields (using model field names)
      const zipCode = value.zipCode || value.zipcode || value.pincode;
      const addressLine1 = value.addressLine1 || value.street;
      
      if (!addressLine1 || !value.city || !value.state || !zipCode) {
        throw new Error("Address must contain addressLine1 (or street), city, state, and zipcode/pincode");
      }
      
      if (!value.name) {
        throw new Error("Address must contain recipient name");
      }
      
      if (!value.phone) {
        throw new Error("Address must contain phone number");
      }
      
      return true;
    }),
  body("loyaltyPointsToRedeem")
    .optional()
    .isInt({ min: 0, max: 1_000_000 })
    .withMessage("loyaltyPointsToRedeem must be an integer from 0 to 1000000"),
  body("tipAmount")
    .optional()
    .isFloat({ min: 0, max: 50000 })
    .withMessage("tipAmount must be a number from 0 to 50000"),
  body("scheduledFor")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === "" || value == null) return true;
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) {
        throw new Error("scheduledFor must be a valid date-time");
      }
      return true;
    }),
  body("scheduledSlotId")
    .optional({ nullable: true })
    .isString()
    .withMessage("scheduledSlotId must be a string")
    .matches(/^\d{4}-\d{2}-\d{2}\|([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("scheduledSlotId must be in format YYYY-MM-DD|HH:mm-HH:mm"),
  body("scheduledSlot")
    .optional({ nullable: true })
    .isObject()
    .withMessage("scheduledSlot must be an object"),
  body("scheduledSlot.date")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("scheduledSlot.date must be YYYY-MM-DD"),
  body("scheduledSlot.startTime")
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("scheduledSlot.startTime must be HH:mm"),
  body("scheduledSlot.endTime")
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("scheduledSlot.endTime must be HH:mm"),
  body("scheduledSlot")
    .optional({ nullable: true })
    .custom((slot, { req }) => {
      if (!slot) return true;
      if (req.body.scheduledFor || req.body.scheduledSlotId) {
        throw new Error("Provide only one of scheduledFor, scheduledSlotId or scheduledSlot");
      }
      if (!slot.date || !slot.startTime || !slot.endTime) {
        throw new Error("scheduledSlot requires date, startTime and endTime");
      }
      const start = new Date(`${slot.date}T${slot.startTime}:00`);
      const end = new Date(`${slot.date}T${slot.endTime}:00`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("scheduledSlot contains invalid date/time");
      }
      if (end <= start) {
        throw new Error("scheduledSlot.endTime must be after startTime");
      }
      const now = Date.now();
      if (start.getTime() <= now) {
        throw new Error("scheduledSlot must be in the future");
      }
      const maxAheadMs = 7 * 24 * 60 * 60 * 1000;
      if (start.getTime() - now > maxAheadMs) {
        throw new Error("scheduledSlot cannot be more than 7 days ahead");
      }
      return true;
    }),
  body()
    .custom((value) => {
      const hasScheduledFor = !!value?.scheduledFor;
      const hasScheduledSlot = !!value?.scheduledSlot;
      const hasScheduledSlotId = !!value?.scheduledSlotId;
      const selectedCount =
        Number(hasScheduledFor) + Number(hasScheduledSlot) + Number(hasScheduledSlotId);
      if (selectedCount > 1) {
        throw new Error("Provide only one of scheduledFor, scheduledSlotId or scheduledSlot");
      }
      return true;
    }),
  handleValidationErrors
];

// Order status update validation
export const validateStatusUpdate = [
  body("orderId")
    .notEmpty()
    .withMessage("Order ID is required")
    .isMongoId()
    .withMessage("Invalid order ID format"),
  body("status")
    .trim()
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"])
    .withMessage("Invalid status value. Must be one of: pending, confirmed, preparing, ready, out_for_delivery, delivered, cancelled"),
  handleValidationErrors
];

// Remove food validation
export const validateRemoveFood = [
  body("id")
    .notEmpty()
    .withMessage("Food ID is required")
    .isMongoId()
    .withMessage("Invalid food ID format"),
  handleValidationErrors
];

// Verify order validation
export const validateVerifyOrder = [
  body("orderId")
    .notEmpty()
    .withMessage("Order ID is required")
    .isMongoId()
    .withMessage("Invalid order ID format"),
  body("success")
    .notEmpty()
    .withMessage("Success status is required")
    .isIn(["true", "false"])
    .withMessage("Success must be 'true' or 'false'"),
  handleValidationErrors
];

export const validateRazorpayCreateOrder = [
  body("orderId")
    .notEmpty()
    .withMessage("orderId is required")
    .isMongoId()
    .withMessage("orderId must be a valid Mongo ID"),
  handleValidationErrors,
];

export const validateRazorpayVerifyPayment = [
  body("orderId")
    .notEmpty()
    .withMessage("orderId is required")
    .isMongoId()
    .withMessage("orderId must be a valid Mongo ID"),
  body("razorpay_order_id")
    .notEmpty()
    .withMessage("razorpay_order_id is required")
    .isLength({ min: 5, max: 200 })
    .withMessage("razorpay_order_id is invalid"),
  body("razorpay_payment_id")
    .notEmpty()
    .withMessage("razorpay_payment_id is required")
    .isLength({ min: 5, max: 200 })
    .withMessage("razorpay_payment_id is invalid"),
  body("razorpay_signature")
    .notEmpty()
    .withMessage("razorpay_signature is required")
    .matches(/^[a-fA-F0-9]{64}$/)
    .withMessage("razorpay_signature must be a 64-char hex hash"),
  handleValidationErrors,
];

export const validateFoodStockUpdate = [
  param("foodId")
    .notEmpty()
    .withMessage("Food ID is required")
    .isMongoId()
    .withMessage("Invalid food ID format"),
  body()
    .custom((value) => {
      const hasStockCount = Object.prototype.hasOwnProperty.call(value || {}, "stockCount");
      const hasDelta = Object.prototype.hasOwnProperty.call(value || {}, "delta");
      const hasAvailability = Object.prototype.hasOwnProperty.call(value || {}, "isAvailable");
      if (!hasStockCount && !hasDelta && !hasAvailability) {
        throw new Error("Provide at least one of: stockCount, delta, isAvailable");
      }
      return true;
    }),
  body("stockCount")
    .optional({ nullable: true })
    .custom((v) => v === null || v === "" || Number.isInteger(Number(v)))
    .withMessage("stockCount must be null/empty or an integer")
    .custom((v) => v === null || v === "" || Number(v) >= 0)
    .withMessage("stockCount must be non-negative"),
  body("delta")
    .optional()
    .custom((v) => Number.isInteger(Number(v)))
    .withMessage("delta must be an integer"),
  body("isAvailable")
    .optional()
    .isBoolean()
    .withMessage("isAvailable must be boolean"),
  handleValidationErrors,
];

export const validateFoodStockBulkUpdate = [
  body("updates")
    .isArray({ min: 1, max: 200 })
    .withMessage("updates must be an array with 1 to 200 items"),
  body("updates.*.foodId")
    .notEmpty()
    .withMessage("Each update requires foodId")
    .isMongoId()
    .withMessage("Each foodId must be a valid Mongo ID"),
  body("updates.*")
    .custom((row) => {
      const hasStockCount = Object.prototype.hasOwnProperty.call(row || {}, "stockCount");
      const hasDelta = Object.prototype.hasOwnProperty.call(row || {}, "delta");
      const hasAvailability = Object.prototype.hasOwnProperty.call(row || {}, "isAvailable");
      if (!hasStockCount && !hasDelta && !hasAvailability) {
        throw new Error("Each update needs stockCount, delta or isAvailable");
      }
      return true;
    }),
  handleValidationErrors,
];

export const validateRestaurantDeliveryZones = [
  body("deliveryZones")
    .optional()
    .isArray()
    .withMessage("deliveryZones must be an array"),
  body("deliveryZones.*.id")
    .optional()
    .isString()
    .withMessage("deliveryZones[].id must be a string")
    .isLength({ max: 64 })
    .withMessage("deliveryZones[].id must be at most 64 characters"),
  body("deliveryZones.*.name")
    .optional()
    .isString()
    .withMessage("deliveryZones[].name must be a string")
    .isLength({ max: 120 })
    .withMessage("deliveryZones[].name must be at most 120 characters"),
  body("deliveryZones.*.isActive")
    .optional()
    .isBoolean()
    .withMessage("deliveryZones[].isActive must be boolean"),
  body("deliveryZones.*.polygon")
    .optional()
    .isArray({ min: 3 })
    .withMessage("deliveryZones[].polygon must be an array with at least 3 points"),
  body("deliveryZones.*.polygon.*.lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("deliveryZones[].polygon[].lat must be between -90 and 90"),
  body("deliveryZones.*.polygon.*.lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("deliveryZones[].polygon[].lng must be between -180 and 180"),
  handleValidationErrors,
];

export const validatePayoutPreviewOrCreate = [
  body("periodStart")
    .notEmpty()
    .withMessage("periodStart is required")
    .custom((value) => !Number.isNaN(new Date(value).getTime()))
    .withMessage("periodStart must be a valid date-time"),
  body("periodEnd")
    .notEmpty()
    .withMessage("periodEnd is required")
    .custom((value) => !Number.isNaN(new Date(value).getTime()))
    .withMessage("periodEnd must be a valid date-time"),
  body("restaurantId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("restaurantId must be a valid Mongo ID"),
  body("statuses")
    .optional({ nullable: true })
    .custom((value) => {
      if (value == null || value === "") return true;
      if (Array.isArray(value)) return true;
      if (typeof value === "string") return true;
      throw new Error("statuses must be an array or comma-separated string");
    }),
  handleValidationErrors,
];

export const validatePayoutBatchStatusUpdate = [
  param("batchId")
    .notEmpty()
    .withMessage("batchId is required")
    .isMongoId()
    .withMessage("batchId must be a valid Mongo ID"),
  body("status")
    .notEmpty()
    .withMessage("status is required")
    .isIn(["finalized", "paid", "reconciled"])
    .withMessage("status must be one of: finalized, paid, reconciled"),
  body("notes")
    .optional()
    .isString()
    .withMessage("notes must be a string")
    .isLength({ max: 2000 })
    .withMessage("notes must be at most 2000 characters"),
  body("paidReference")
    .optional()
    .isString()
    .withMessage("paidReference must be a string")
    .isLength({ max: 200 })
    .withMessage("paidReference must be at most 200 characters"),
  handleValidationErrors,
];

export const validatePayoutBatchIdParam = [
  param("batchId")
    .notEmpty()
    .withMessage("batchId is required")
    .isMongoId()
    .withMessage("batchId must be a valid Mongo ID"),
  handleValidationErrors,
];

