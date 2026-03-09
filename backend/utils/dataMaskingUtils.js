/**
 * Data Masking Utilities
 * Masks sensitive PII in responses for privacy
 */

/**
 * Mask email address (shows only first 2 chars and domain)
 */
export const maskEmail = (email) => {
  if (!email) return '';
  const [localPart, domain] = email.split('@');
  if (!domain) return email;
  if (localPart.length <= 2) return `${localPart}***@${domain}`;
  return `${localPart.substring(0, 2)}***@${domain}`;
};

/**
 * Mask phone number (shows only first 2 and last 2 digits)
 */
export const maskPhone = (phone) => {
  if (!phone) return '';
  if (phone.length <= 4) return '***';
  return `${phone.substring(0, 2)}***${phone.slice(-2)}`;
};

/**
 * Mask address line (shows only first part)
 */
export const maskAddress = (address) => {
  if (!address) return '';
  if (address.length <= 10) return address;
  return `${address.substring(0, 10)}***`;
};

/**
 * Mask pincode (shows only first 2 digits)
 */
export const maskPincode = (pincode) => {
  if (!pincode) return '';
  if (pincode.length <= 2) return '***';
  return `${pincode.substring(0, 2)}***`;
};

/**
 * Mask name (shows only first letter)
 */
export const maskName = (name) => {
  if (!name) return '';
  if (name.length <= 1) return '***';
  return `${name.substring(0, 1)}***`;
};

/**
 * Mask user object for admin views (partial masking)
 */
export const maskUserForAdmin = (user, includeFullData = false) => {
  if (!user) return user;
  
  const masked = { ...user.toObject ? user.toObject() : user };
  
  if (!includeFullData) {
    // Partial masking for admin list views
    if (masked.email) masked.email = maskEmail(masked.email);
    if (masked.phone) masked.phone = maskPhone(masked.phone);
    
    // Mask addresses
    if (masked.addresses && Array.isArray(masked.addresses)) {
      masked.addresses = masked.addresses.map(addr => ({
        ...addr,
        phone: maskPhone(addr.phone),
        email: addr.email ? maskEmail(addr.email) : addr.email,
        addressLine1: maskAddress(addr.addressLine1),
        pincode: maskPincode(addr.pincode)
      }));
    }
  }
  
  // Always remove password
  delete masked.password;
  
  return masked;
};

/**
 * Mask order data for admin views
 */
export const maskOrderForAdmin = (order, includeFullData = false) => {
  if (!order) return order;
  
  const masked = { ...order.toObject ? order.toObject() : order };
  
  if (!includeFullData && masked.address) {
    masked.address = {
      ...masked.address,
      phone: maskPhone(masked.address.phone),
      email: masked.address.email ? maskEmail(masked.address.email) : masked.address.email,
      addressLine1: maskAddress(masked.address.addressLine1),
      pincode: maskPincode(masked.address.pincode)
    };
  }
  
  return masked;
};

/**
 * Check if user should see full data (own data or admin with permission)
 */
export const shouldShowFullData = (userId, dataUserId, userRole) => {
  // User can see their own full data
  if (userId && dataUserId && userId.toString() === dataUserId.toString()) {
    return true;
  }
  
  // Admin can see full data (but can be masked in list views)
  if (userRole === 'admin') {
    return true; // Admin has permission, but masking can still be applied
  }
  
  return false;
};

