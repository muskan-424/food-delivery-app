/**
 * HTTPS Enforcement Middleware
 * Redirects HTTP requests to HTTPS in production
 */
const httpsEnforcement = (req, res, next) => {
  // Skip in development
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Check if request is already secure
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    return next();
  }

  // Redirect to HTTPS
  const httpsUrl = `https://${req.headers.host}${req.originalUrl}`;
  return res.redirect(301, httpsUrl);
};

export default httpsEnforcement;

