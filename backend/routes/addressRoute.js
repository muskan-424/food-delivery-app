import express from "express";
import { getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress } from "../controllers/addressController.js";
import authMiddleware from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const addressRouter = express.Router();

// Apply idempotency to address creation
const addressIdempotency = idempotencyMiddleware({ endpoints: ['/'] });

addressRouter.get("/", apiLimiter, authMiddleware, getAddresses);
addressRouter.post("/", apiLimiter, authMiddleware, addressIdempotency, addAddress);
addressRouter.put("/:addressId", apiLimiter, authMiddleware, updateAddress);
addressRouter.delete("/:addressId", apiLimiter, authMiddleware, deleteAddress);
addressRouter.put("/:addressId/default", apiLimiter, authMiddleware, setDefaultAddress);

export default addressRouter;

