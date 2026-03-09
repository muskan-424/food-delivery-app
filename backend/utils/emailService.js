import nodemailer from "nodemailer";

// Email service configuration
const createTransporter = () => {
  // Use environment variables for email configuration
  // For development, you can use Gmail or other services
  // For production, use proper SMTP service like SendGrid, AWS SES, etc.
  
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
      }
    });
  }
  
  // Generic SMTP configuration
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
};

// Send password reset email
export const sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
  try {
    const transporter = createTransporter();
    
    const resetLink = resetUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Click the link below to reset it:</p>
          <p><a href="${resetLink}" style="background-color: #4ecdc4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all;">${resetLink}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// Send 2FA setup email
export const send2FASetupEmail = async (email, backupCodes) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Two-Factor Authentication Enabled',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Two-Factor Authentication Enabled</h2>
          <p>Two-factor authentication has been enabled for your account.</p>
          <p><strong>Important: Save these backup codes in a safe place:</strong></p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            ${backupCodes.map(code => `<p style="font-family: monospace; font-size: 16px; margin: 5px 0;">${code}</p>`).join('')}
          </div>
          <p>These codes can be used to access your account if you lose access to your authenticator app.</p>
          <p style="color: #e74c3c;"><strong>Warning: Each code can only be used once!</strong></p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending 2FA setup email:', error);
    return false;
  }
};

// Send account lockout notification
export const sendAccountLockoutEmail = async (email, unlockTime) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Account Locked - Security Alert',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">Account Locked</h2>
          <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
          <p><strong>Account will be unlocked at: ${unlockTime}</strong></p>
          <p>If this was not you, please contact support immediately.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated security message.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending lockout email:', error);
    return false;
  }
};

