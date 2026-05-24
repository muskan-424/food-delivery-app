import UserActivity from "../models/userActivityModel.js";
import userModel from "../models/userModel.js";
import { appConfig } from "../config/appConfig.js";
import { recordHttpAnalyticsEvent } from "../services/analyticsEventService.js";

const METRIC_ROUTE_CAP = 300;
const requestMetricsState = {
  startedAt: new Date().toISOString(),
  totals: {
    requests: 0,
    errors5xx: 0,
    errors4xx: 0,
    slow: 0,
  },
  byRoute: {},
};

function normalizeMetricPath(path) {
  return String(path || "")
    .replace(/[0-9a-f]{24}/gi, ":id")
    .replace(/\b\d+\b/g, ":n")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid");
}

function updateRequestMetrics({ method, path, statusCode, durationMs }) {
  const key = `${String(method || "GET").toUpperCase()} ${normalizeMetricPath(path)}`;
  if (!requestMetricsState.byRoute[key] && Object.keys(requestMetricsState.byRoute).length >= METRIC_ROUTE_CAP) {
    return;
  }
  requestMetricsState.totals.requests += 1;
  if (statusCode >= 500) requestMetricsState.totals.errors5xx += 1;
  else if (statusCode >= 400) requestMetricsState.totals.errors4xx += 1;
  if (durationMs >= appConfig.requestLogSlowMs) requestMetricsState.totals.slow += 1;

  const row = requestMetricsState.byRoute[key] || {
    method: String(method || "GET").toUpperCase(),
    path: normalizeMetricPath(path),
    count: 0,
    errors4xx: 0,
    errors5xx: 0,
    slow: 0,
    avgMs: 0,
    maxMs: 0,
    lastStatusCode: 0,
    lastAt: null,
  };
  row.count += 1;
  if (statusCode >= 500) row.errors5xx += 1;
  else if (statusCode >= 400) row.errors4xx += 1;
  if (durationMs >= appConfig.requestLogSlowMs) row.slow += 1;
  row.avgMs = Math.round((((row.avgMs * (row.count - 1)) + durationMs) / row.count) * 100) / 100;
  row.maxMs = Math.max(row.maxMs || 0, Math.round(durationMs * 100) / 100);
  row.lastStatusCode = statusCode;
  row.lastAt = new Date().toISOString();
  requestMetricsState.byRoute[key] = row;
}

export function getRequestMetricsSnapshot() {
  const routes = Object.values(requestMetricsState.byRoute)
    .sort((a, b) => b.count - a.count)
    .slice(0, METRIC_ROUTE_CAP);
  return {
    startedAt: requestMetricsState.startedAt,
    routeCap: METRIC_ROUTE_CAP,
    totals: { ...requestMetricsState.totals },
    routeCount: routes.length,
    routes,
    generatedAt: new Date().toISOString(),
  };
}

function shouldEmitStructuredRequestLog({
  statusCode,
  durationMs,
  path,
}) {
  if (!appConfig.enableStructuredRequestLogs) return false;
  if (statusCode >= 500) return true;
  if (durationMs >= appConfig.requestLogSlowMs) return true;
  if (path.startsWith("/api/health")) return false;
  return Math.random() < appConfig.requestLogSampleRate;
}

// Activity logger middleware
const activityLogger = async (req, res, next) => {
  // Skip logging for certain paths
  const skipPaths = ['/images', '/api/support/faq'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Capture request details
  const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];
  const requestMethod = req.method;
  const requestUrl = req.originalUrl || req.url;
  const reqStart = process.hrtime.bigint();

  // Determine activity type from route
  const activityType = determineActivityType(req.path, requestMethod);
  
  // Get user info if authenticated
  let userId = null;
  let userEmail = '';
  let userName = '';
  let isAuthenticated = false;

  if (req.body.userId) {
    userId = req.body.userId;
    isAuthenticated = true;
    
    try {
      const user = await userModel.findById(userId);
      if (user) {
        userEmail = user.email;
        userName = user.name;
        // Update last activity
        user.lastActivityAt = new Date();
        await user.save();
      }
    } catch (error) {
      console.error('Error fetching user in activity logger:', error);
    }
  }

  // Determine if activity is suspicious
  const suspiciousCheck = await checkSuspiciousActivity(req, userId, activityType);

  // Log activity asynchronously (don't block request)
  setImmediate(async () => {
    try {
      const activityDescription = generateActivityDescription(req, activityType);
      
      const activity = new UserActivity({
        userId: userId || null,
        userEmail: userEmail || 'anonymous',
        userName: userName || 'Anonymous User',
        activityType,
        activityDescription,
        ipAddress,
        userAgent,
        requestMethod,
        requestUrl,
        requestBody: sanitizeRequestBody(req.body),
        responseStatus: res.statusCode,
        isAuthenticated,
        isSuspicious: suspiciousCheck.isSuspicious,
        suspiciousReason: suspiciousCheck.reason,
        metadata: {
          params: req.params,
          query: req.query
        }
      });

      await activity.save();
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  });

  // Structured request log on response completion (stdout)
  res.on("finish", () => {
    try {
      const durationMs = Number(process.hrtime.bigint() - reqStart) / 1_000_000;
      const statusCode = Number(res.statusCode || 0);
      updateRequestMetrics({
        method: requestMethod,
        path: req.path || "",
        statusCode,
        durationMs,
      });
      if (
        !shouldEmitStructuredRequestLog({
          statusCode,
          durationMs,
          path: req.path || "",
        })
      ) {
        return;
      }
      const payload = {
        ts: new Date().toISOString(),
        kind: "http_request",
        requestId: req.requestId || "",
        method: requestMethod,
        path: req.path || "",
        url: requestUrl,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        sampled: !(statusCode >= 500 || durationMs >= appConfig.requestLogSlowMs),
        userId: String(req.body?.userId || ""),
        role: String(req.body?.role || ""),
        ipAddress: ipAddress || "",
      };
      console.log(JSON.stringify(payload));
      setImmediate(() => {
        recordHttpAnalyticsEvent(payload).catch(() => null);
      });
    } catch (error) {
      console.error("structured_request_log_error:", error?.message || error);
    }
  });

  next();
};

// Determine activity type from route
const determineActivityType = (path, method) => {
  const pathLower = path.toLowerCase();
  
  if (pathLower.includes('/user/login')) return 'login';
  if (pathLower.includes('/user/signup')) return 'signup';
  if (pathLower.includes('/user/logout')) return 'logout';
  if (pathLower.includes('/food/list')) return 'view_food';
  if (pathLower.includes('/cart/add')) return 'add_to_cart';
  if (pathLower.includes('/cart/remove')) return 'remove_from_cart';
  if (pathLower.includes('/order/place')) return 'place_order';
  if (pathLower.includes('/order/cancel')) return 'cancel_order';
  if (pathLower.includes('/profile') && method === 'PUT') return 'update_profile';
  if (pathLower.includes('/profile/password')) return 'change_password';
  if (pathLower.includes('/address') && method === 'POST') return 'add_address';
  if (pathLower.includes('/address') && method === 'PUT') return 'update_address';
  if (pathLower.includes('/address') && method === 'DELETE') return 'delete_address';
  if (pathLower.includes('/review') && method === 'POST') return 'add_review';
  if (pathLower.includes('/review') && method === 'PUT') return 'update_review';
  if (pathLower.includes('/review') && method === 'DELETE') return 'delete_review';
  if (pathLower.includes('/wishlist') && method === 'POST') return 'add_to_wishlist';
  if (pathLower.includes('/wishlist') && method === 'DELETE') return 'remove_from_wishlist';
  if (pathLower.includes('/support/ticket') && method === 'POST') return 'create_support_ticket';
  if (pathLower.includes('/support/ticket') && pathLower.includes('/message')) return 'send_message';
  if (pathLower.includes('/payment/user')) return 'view_payment_history';
  if (pathLower.includes('/coupon/validate')) return 'apply_coupon';
  if (pathLower.includes('/food/list') && pathLower.includes('search')) return 'search';
  if (pathLower.includes('/food/list') && pathLower.includes('filter')) return 'filter';
  
  return 'other';
};

// Generate activity description
const generateActivityDescription = (req, activityType) => {
  const descriptions = {
    'login': 'User logged in',
    'logout': 'User logged out',
    'signup': 'New user registered',
    'view_food': 'User viewed food items',
    'add_to_cart': 'User added item to cart',
    'remove_from_cart': 'User removed item from cart',
    'place_order': 'User placed an order',
    'cancel_order': 'User cancelled an order',
    'update_profile': 'User updated profile',
    'change_password': 'User changed password',
    'add_address': 'User added address',
    'update_address': 'User updated address',
    'delete_address': 'User deleted address',
    'add_review': 'User added review',
    'update_review': 'User updated review',
    'delete_review': 'User deleted review',
    'add_to_wishlist': 'User added item to wishlist',
    'remove_from_wishlist': 'User removed item from wishlist',
    'create_support_ticket': 'User created support ticket',
    'send_message': 'User sent message',
    'view_payment_history': 'User viewed payment history',
    'apply_coupon': 'User applied coupon',
    'search': 'User performed search',
    'filter': 'User applied filters',
    'other': `User performed ${req.method} request on ${req.path}`
  };

  return descriptions[activityType] || descriptions['other'];
};

// Check for suspicious activity
const checkSuspiciousActivity = async (req, userId, activityType) => {
  const suspiciousReasons = [];

  // Check for unauthenticated access to protected routes
  if (!userId && isProtectedRoute(req.path)) {
    suspiciousReasons.push('Unauthenticated access attempt to protected route');
  }

  // Check for rapid requests (potential abuse)
  if (userId) {
    try {
      const recentActivities = await UserActivity.countDocuments({
        userId,
        createdAt: { $gte: new Date(Date.now() - 60000) } // Last minute
      });
      
      if (recentActivities > 30) {
        suspiciousReasons.push('Excessive requests in short time');
      }
    } catch (error) {
      console.error('Error checking rapid requests:', error);
    }
  }

  // Check for unusual patterns
  if (activityType === 'place_order' && !userId) {
    suspiciousReasons.push('Order placement attempt without authentication');
  }

  return {
    isSuspicious: suspiciousReasons.length > 0,
    reason: suspiciousReasons.join('; ')
  };
};

// Check if route is protected
const isProtectedRoute = (path) => {
  const protectedPaths = [
    '/api/order',
    '/api/cart',
    '/api/profile',
    '/api/address',
    '/api/review',
    '/api/wishlist',
    '/api/support/ticket',
    '/api/payment'
  ];
  
  return protectedPaths.some(protectedPath => path.startsWith(protectedPath));
};

// Sanitize request body (remove sensitive data and mask PII)
const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'jwt', 'secret', 'key', 'twoFactorSecret'];
  
  // Redact sensitive fields
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  // Mask PII (email, phone, address)
  if (sanitized.email) {
    const [localPart, domain] = sanitized.email.split('@');
    sanitized.email = localPart ? `${localPart.substring(0, 2)}***@${domain || ''}` : '[MASKED]';
  }
  
  if (sanitized.phone) {
    sanitized.phone = sanitized.phone.length > 4 
      ? `${sanitized.phone.substring(0, 2)}***${sanitized.phone.slice(-2)}`
      : '[MASKED]';
  }
  
  // Mask address fields
  if (sanitized.address) {
    if (typeof sanitized.address === 'object') {
      sanitized.address = {
        ...sanitized.address,
        phone: sanitized.address.phone ? `${sanitized.address.phone.substring(0, 2)}***${sanitized.address.phone.slice(-2)}` : sanitized.address.phone,
        email: sanitized.address.email ? (() => {
          const [local, domain] = sanitized.address.email.split('@');
          return local ? `${local.substring(0, 2)}***@${domain || ''}` : '[MASKED]';
        })() : sanitized.address.email,
        addressLine1: sanitized.address.addressLine1 ? `${sanitized.address.addressLine1.substring(0, 10)}***` : sanitized.address.addressLine1,
        pincode: sanitized.address.pincode ? `${sanitized.address.pincode.substring(0, 2)}***` : sanitized.address.pincode
      };
    }
  }
  
  // Mask nested address data
  if (sanitized.addresses && Array.isArray(sanitized.addresses)) {
    sanitized.addresses = sanitized.addresses.map(addr => ({
      ...addr,
      phone: addr.phone ? `${addr.phone.substring(0, 2)}***${addr.phone.slice(-2)}` : addr.phone,
      email: addr.email ? (() => {
        const [local, domain] = addr.email.split('@');
        return local ? `${local.substring(0, 2)}***@${domain || ''}` : '[MASKED]';
      })() : addr.email,
      addressLine1: addr.addressLine1 ? `${addr.addressLine1.substring(0, 10)}***` : addr.addressLine1,
      pincode: addr.pincode ? `${addr.pincode.substring(0, 2)}***` : addr.pincode
    }));
  }
  
  return sanitized;
};

export default activityLogger;

