import { body, validationResult } from "express-validator";

// Validation error handler middleware
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array()
    });
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

