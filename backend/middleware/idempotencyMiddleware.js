import idempotencyModel from "../models/idempotencyModel.js";
import crypto from "crypto";

/**
 * Idempotency Middleware
 * 
 * Ensures that making the same request multiple times has the same effect as making it once.
 * 
 * Usage:
 * - Client sends `Idempotency-Key` header with a unique value (UUID recommended)
 * - Server stores the key with the response
 * - If the same key is used again within 24 hours, returns cached response
 * 
 * @param {Object} options - Configuration options
 * @param {Array} options.endpoints - List of endpoint paths to apply idempotency to
 * @param {Number} options.ttl - Time to live in seconds (default: 86400 = 24 hours)
 */
const idempotencyMiddleware = (options = {}) => {
  const { endpoints = [], ttl = 86400 } = options;

  return async (req, res, next) => {
    // Only apply to specified endpoints
    const endpoint = req.path;
    const basePath = req.baseUrl || '';
    const fullPath = basePath + endpoint;
    
    // Check if endpoint matches any of the specified patterns
    if (endpoints.length > 0) {
      const matches = endpoints.some(pattern => {
        // Exact match
        if (pattern === endpoint || pattern === fullPath) return true;
        
        // Pattern match for dynamic routes (e.g., '/process/:paymentId' matches '/process/123')
        if (pattern.includes(':')) {
          const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
          return regex.test(endpoint) || regex.test(fullPath);
        }
        
        // Prefix match (e.g., '/admin/create' matches '/admin/create')
        if (endpoint.startsWith(pattern) || fullPath.startsWith(pattern)) return true;
        
        // Match without leading slash
        const normalizedPattern = pattern.startsWith('/') ? pattern : '/' + pattern;
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        if (normalizedEndpoint.startsWith(normalizedPattern)) return true;
        
        return false;
      });
      
      if (!matches) {
        return next();
      }
    }

    // Only apply to POST, PUT, PATCH methods (state-changing operations)
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Get idempotency key from header
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    
    if (!idempotencyKey) {
      // Idempotency key is optional - if not provided, proceed normally
      return next();
    }

    // Validate key format (should be a valid UUID or similar unique string)
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 10 || idempotencyKey.length > 200) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid Idempotency-Key format. Must be a string between 10-200 characters." 
      });
    }

    try {
      // Get userId from request (set by authMiddleware)
      const userId = req.body.userId || req.user?.id || 'anonymous';
      
      // Check if this key was already used
      const existingRecord = await idempotencyModel.findOne({ 
        key: idempotencyKey,
        userId: userId,
        endpoint: endpoint
      });

      if (existingRecord) {
        // Return cached response
        return res
          .status(existingRecord.statusCode)
          .json(existingRecord.response);
      }

      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override res.json to capture response
      res.json = function(data) {
        // Store response in database (async, don't wait)
        // Use create with error handling for race conditions
        idempotencyModel.create({
          key: idempotencyKey,
          userId: userId,
          endpoint: endpoint,
          response: data,
          statusCode: res.statusCode || 200,
          createdAt: new Date()
        }).catch(err => {
          // If duplicate key error (race condition), that's fine - another request already stored it
          // For other errors, log but don't fail the request
          if (err.code !== 11000) { // 11000 is MongoDB duplicate key error
            console.error('Error storing idempotency key:', err);
          }
        });

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      // On error, proceed without idempotency (fail open)
      next();
    }
  };
};

/**
 * Generate a unique idempotency key (for client-side use)
 * @returns {string} A unique idempotency key
 */
export const generateIdempotencyKey = () => {
  return crypto.randomUUID();
};

export default idempotencyMiddleware;