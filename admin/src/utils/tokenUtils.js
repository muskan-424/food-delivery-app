/**
 * JWT Token Utility Functions
 * Handles token validation, expiration checking, and storage
 */

/**
 * Decode JWT token without verification (for client-side expiration check)
 * @param {string} token - JWT token string
 * @returns {object|null} - Decoded token payload or null if invalid
 */
export const decodeToken = (token) => {
  if (!token) return null;
  
  try {
    // JWT tokens have 3 parts separated by dots: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Decode the payload (second part)
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Check if token is expired
 * @param {string} token - JWT token string
 * @returns {boolean} - True if token is expired or invalid
 */
export const isTokenExpired = (token) => {
  if (!token) return true;
  
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp is in seconds, Date.now() is in milliseconds
  const expirationTime = decoded.exp * 1000;
  const currentTime = Date.now();
  
  return currentTime >= expirationTime;
};

/**
 * Get token expiration time
 * @param {string} token - JWT token string
 * @returns {Date|null} - Expiration date or null if invalid
 */
export const getTokenExpiration = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return null;
  
  return new Date(decoded.exp * 1000);
};

/**
 * Get time until token expires
 * @param {string} token - JWT token string
 * @returns {number|null} - Milliseconds until expiration or null if invalid
 */
export const getTimeUntilExpiration = (token) => {
  if (isTokenExpired(token)) return null;
  
  const expiration = getTokenExpiration(token);
  if (!expiration) return null;
  
  return expiration.getTime() - Date.now();
};

/**
 * Check if token is valid (exists and not expired)
 * @param {string} token - JWT token string
 * @returns {boolean} - True if token is valid
 */
export const isTokenValid = (token) => {
  return token && !isTokenExpired(token);
};

/**
 * Save token to localStorage
 * @param {string} token - JWT token string
 */
export const saveToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
    // Also store expiration time for quick checks
    const expiration = getTokenExpiration(token);
    if (expiration) {
      localStorage.setItem('tokenExpiration', expiration.toISOString());
    }
  }
};

/**
 * Get token from localStorage
 * @returns {string|null} - Token string or null if not found/expired
 */
export const getToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  
  // Check if token is expired
  if (isTokenExpired(token)) {
    // Remove expired token
    removeToken();
    return null;
  }
  
  return token;
};

/**
 * Remove token from localStorage
 */
export const removeToken = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('tokenExpiration');
};

