import crypto from "crypto";

// Lazy initialization of encryption key
let ENCRYPTION_KEY = null;
let keyChecked = false;

const getEncryptionKey = () => {
  if (!keyChecked) {
    // Only check for encryption key when actually needed
    if (!process.env.ENCRYPTION_KEY) {
      console.error('CRITICAL ERROR: ENCRYPTION_KEY environment variable is not set!');
      console.error('Please set ENCRYPTION_KEY in your .env file to a 32-byte hex string.');
      console.error('Example: ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456');
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    keyChecked = true;
  }
  return ENCRYPTION_KEY;
};

const ALGORITHM = 'aes-256-cbc';

// Ensure encryption key is 32 bytes
const getEncryptionKeyBuffer = () => {
  const key = getEncryptionKey();
  if (key.length === 64) {
    // Hex string, convert to buffer
    return Buffer.from(key, 'hex');
  } else if (key.length === 32) {
    // Already 32 bytes
    return Buffer.from(key);
  } else {
    // Derive 32-byte key using SHA-256
    return crypto.createHash('sha256').update(key).digest();
  }
};

/**
 * Encrypt sensitive data (phone, address fields)
 */
export const encryptField = (text) => {
  if (!text || text.trim() === '') return text;
  
  try {
    const key = getEncryptionKeyBuffer();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data (IV is needed for decryption)
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Return original if encryption fails
  }
};

/**
 * Decrypt sensitive data
 */
export const decryptField = (encryptedText) => {
  if (!encryptedText || encryptedText.trim() === '') return encryptedText;
  
  // Check if already decrypted (doesn't contain ':')
  if (!encryptedText.includes(':')) {
    return encryptedText; // Already plaintext
  }
  
  try {
    const key = getEncryptionKeyBuffer();
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText; // Invalid format
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedText; // Return original if decryption fails
  }
};

/**
 * Encrypt object fields (for addresses, etc.)
 */
export const encryptObjectFields = (obj, fieldsToEncrypt = ['phone', 'email', 'addressLine1', 'addressLine2', 'pincode']) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const encrypted = { ...obj };
  fieldsToEncrypt.forEach(field => {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encryptField(encrypted[field]);
    }
  });
  
  return encrypted;
};

/**
 * Decrypt object fields
 */
export const decryptObjectFields = (obj, fieldsToDecrypt = ['phone', 'email', 'addressLine1', 'addressLine2', 'pincode']) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const decrypted = { ...obj };
  fieldsToDecrypt.forEach(field => {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      decrypted[field] = decryptField(decrypted[field]);
    }
  });
  
  return decrypted;
};

/**
 * Hash PII for anonymization (one-way, cannot be reversed)
 */
export const hashPII = (text, salt = '') => {
  if (!text) return '';
  const hash = crypto.createHash('sha256');
  hash.update(text + salt);
  return hash.digest('hex').substring(0, 16); // First 16 chars for shorter hash
};

/**
 * Anonymize user data
 */
export const anonymizeUserData = (userData) => {
  const anonymized = { ...userData };
  
  // Anonymize email
  if (anonymized.email) {
    const [localPart, domain] = anonymized.email.split('@');
    anonymized.email = `${localPart.substring(0, 2)}***@${domain}`;
  }
  
  // Anonymize phone
  if (anonymized.phone) {
    anonymized.phone = anonymized.phone.substring(0, 2) + '***' + anonymized.phone.slice(-2);
  }
  
  // Anonymize name
  if (anonymized.name) {
    anonymized.name = anonymized.name.substring(0, 1) + '***';
  }
  
  // Anonymize addresses
  if (anonymized.addresses && Array.isArray(anonymized.addresses)) {
    anonymized.addresses = anonymized.addresses.map(addr => ({
      ...addr,
      name: addr.name ? addr.name.substring(0, 1) + '***' : addr.name,
      phone: addr.phone ? addr.phone.substring(0, 2) + '***' + addr.phone.slice(-2) : addr.phone,
      email: addr.email ? addr.email.split('@')[0].substring(0, 2) + '***@' + addr.email.split('@')[1] : addr.email,
      addressLine1: addr.addressLine1 ? addr.addressLine1.substring(0, 10) + '***' : addr.addressLine1,
      pincode: addr.pincode ? '***' : addr.pincode
    }));
  }
  
  return anonymized;
};

