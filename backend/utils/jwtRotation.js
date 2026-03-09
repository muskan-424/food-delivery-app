import jwt from "jsonwebtoken";

/**
 * JWT Secret Rotation Utility
 * 
 * This allows for seamless rotation of JWT secrets without invalidating all existing tokens.
 * Supports multiple secrets (current and previous) during rotation period.
 */

// Get current JWT secret
export const getCurrentSecret = () => {
  return process.env.JWT_SECRET;
};

// Get previous JWT secret (for rotation period)
export const getPreviousSecret = () => {
  return process.env.JWT_SECRET_PREVIOUS;
};

// Get refresh token secret
export const getRefreshSecret = () => {
  return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
};

// Verify token with rotation support (tries current, then previous secret)
export const verifyTokenWithRotation = (token, tokenType = 'access') => {
  const secrets = tokenType === 'refresh' 
    ? [getRefreshSecret(), process.env.JWT_REFRESH_SECRET_PREVIOUS].filter(Boolean)
    : [getCurrentSecret(), getPreviousSecret()].filter(Boolean);

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret);
      return { decoded, secret: secret === getCurrentSecret() ? 'current' : 'previous' };
    } catch (error) {
      // Try next secret
      continue;
    }
  }
  
  throw new Error('Invalid or expired token');
};

// Rotate JWT secrets (admin function)
export const rotateSecrets = () => {
  // In production, this should:
  // 1. Set JWT_SECRET_PREVIOUS = current JWT_SECRET
  // 2. Generate new JWT_SECRET
  // 3. Update environment variables
  // 4. Wait for rotation period (e.g., 24 hours) before removing previous secret
  
  import('crypto').then(crypto => {
    const newSecret = crypto.randomBytes(64).toString('hex');
    
    console.log('=== JWT Secret Rotation ===');
    console.log('New JWT_SECRET generated. Update your .env file:');
    console.log(`JWT_SECRET_PREVIOUS=${process.env.JWT_SECRET}`);
    console.log(`JWT_SECRET=${newSecret}`);
    console.log('Keep JWT_SECRET_PREVIOUS for 24-48 hours to allow existing tokens to expire.');
    console.log('==========================');
    
    return {
      newSecret,
      previousSecret: process.env.JWT_SECRET,
      instructions: [
        '1. Update .env file with new secrets',
        '2. Keep JWT_SECRET_PREVIOUS for rotation period (24-48 hours)',
        '3. Restart server after updating .env',
        '4. After rotation period, remove JWT_SECRET_PREVIOUS'
      ]
    };
  });
};

// Check if rotation is needed (based on secret age or security policy)
export const shouldRotateSecrets = (rotationIntervalDays = 90) => {
  // In a real implementation, you might track when the secret was last rotated
  // For now, this is a placeholder that can be enhanced
  return {
    shouldRotate: false,
    reason: 'Manual rotation recommended every 90 days',
    lastRotation: null // Would be stored in database or config
  };
};

