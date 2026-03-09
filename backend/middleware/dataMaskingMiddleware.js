import { maskUserForAdmin, maskOrderForAdmin, shouldShowFullData } from "../utils/dataMaskingUtils.js";

/**
 * Data Masking Middleware
 * Masks PII in responses for admin views (unless explicitly requested)
 */
const dataMaskingMiddleware = (options = {}) => {
  const { 
    maskForAdmin = true, 
    maskForList = true,
    includeFullDataParam = 'fullData' 
  } = options;

  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override res.json to mask data
    res.json = function(data) {
      const userRole = req.body.role;
      const userId = req.body.userId;
      const includeFullData = req.query[includeFullDataParam] === 'true';

      // Only mask for admin list views
      if (userRole === 'admin' && maskForAdmin && maskForList && !includeFullData) {
        if (data.success && data.data) {
          // Handle array of users/orders
          if (Array.isArray(data.data)) {
            data.data = data.data.map(item => {
              if (item.email || item.phone) {
                return maskUserForAdmin(item, false);
              }
              if (item.address) {
                return maskOrderForAdmin(item, false);
              }
              return item;
            });
          }
          // Handle single user/order
          else if (data.data.email || data.data.phone) {
            data.data = maskUserForAdmin(data.data, includeFullData);
          }
          else if (data.data.address) {
            data.data = maskOrderForAdmin(data.data, includeFullData);
          }
        }
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
};

export default dataMaskingMiddleware;

