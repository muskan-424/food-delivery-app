# Complete Features Documentation - Enhanced Security & Authentication

This document covers all features implemented today: Enhanced Authentication, Idempotency, and Comprehensive Data Protection.

---

## 📦 Libraries Installed

### New Dependencies Added:
```json
{
  "speakeasy": "^2.0.0",        // Two-Factor Authentication (TOTP)
  "qrcode": "^1.5.4",           // QR Code generation for 2FA
  "nodemailer": "^7.0.11",      // Email service for password reset & notifications
  "node-cron": "^3.1.4",        // Scheduled jobs for data retention
  "crypto-js": "^4.2.0",        // Additional crypto utilities (if needed)
  "express-enforces-ssl": "^1.1.0" // HTTPS enforcement (optional)
}
```

### Library Functions Used:

#### **speakeasy** (2FA)
- `speakeasy.generateSecret()` - Generates TOTP secret
- `speakeasy.totp.verify()` - Verifies TOTP codes
- Secret encoding: `base32`

#### **qrcode** (2FA QR Codes)
- `QRCode.toDataURL()` - Generates QR code as data URL
- Format: PNG data URL for embedding in HTML

#### **nodemailer** (Email Service)
- `nodemailer.createTransport()` - Creates email transporter
- `transporter.sendMail()` - Sends emails
- Supports: Gmail, SMTP, SendGrid, AWS SES

#### **node-cron** (Scheduled Jobs)
- `cron.schedule()` - Schedules recurring tasks
- Cron format: `'0 2 * * *'` (daily at 2 AM)

#### **crypto** (Node.js Built-in)
- `crypto.randomBytes()` - Generates secure random tokens
- `crypto.createHash()` - Creates hash for token hashing
- `crypto.createCipheriv()` - AES encryption
- `crypto.createDecipheriv()` - AES decryption
- `crypto.randomUUID()` - Generates UUID for idempotency keys

#### **bcrypt** (Password Hashing)
- `bcrypt.genSalt()` - Generates salt (10 rounds default)
- `bcrypt.hash()` - Hashes password
- `bcrypt.compare()` - Compares password with hash

#### **jsonwebtoken** (JWT Tokens)
- `jwt.sign()` - Creates JWT token
- `jwt.verify()` - Verifies JWT token
- Token types: `access` (15min), `refresh` (7 days)

#### **validator** (Input Validation)
- `validator.isEmail()` - Validates email format
- `validator.isMobilePhone()` - Validates phone numbers
- `validator.normalizeEmail()` - Normalizes email addresses

#### **express-validator** (Request Validation)
- `body()` - Validates request body fields
- `validationResult()` - Gets validation errors
- Validators: `notEmpty()`, `isLength()`, `isEmail()`, `matches()`, `isFloat()`, `isMongoId()`

#### **mongoose** (Database)
- `mongoose.Schema` - Defines schemas
- `schema.pre('save')` - Pre-save hooks (encryption)
- `schema.post('find')` - Post-find hooks (decryption)
- `.select('-password')` - Excludes fields from query

---

## 🔐 PART 1: Enhanced Authentication Features

### 1. Refresh Token Mechanism

**Library**: `jsonwebtoken`, `crypto`

**Implementation**:
- **Access Tokens**: Short-lived (15 minutes) using `jwt.sign()` with `expiresIn: '15m'`
- **Refresh Tokens**: Long-lived (7 days) using `jwt.sign()` with `expiresIn: '7d'`
- **Storage**: Refresh tokens stored in `RefreshToken` model, hashed using `crypto.createHash('sha256')`
- **Revocation**: Tokens can be revoked individually or all at once

**Functions Used**:
- `createAccessToken(userId)` - Creates 15-minute access token
- `createRefreshToken(userId)` - Creates 7-day refresh token
- `verifyRefreshToken(token)` - Verifies refresh token
- `storeRefreshToken()` - Stores hashed token in database
- `revokeRefreshToken()` - Revokes single token
- `revokeAllUserTokens()` - Revokes all user tokens

**Models**:
- `backend/models/refreshTokenModel.js` - Stores refresh tokens with TTL index

**API Endpoints**:
- `POST /api/user/refresh` - Refresh access token
  - Body: `{ refreshToken: string }`
  - Returns: `{ accessToken: string }`

**Files**:
- `backend/utils/authUtils.js` - Token creation/verification utilities
- `backend/controllers/userController.js` - Login/register with refresh tokens
- `backend/routes/userRoute.js` - Added refresh route

---

### 2. Enhanced Password Validation

**Library**: `express-validator`, `validator`

**Implementation**:
- **Minimum Length**: 8 characters (was 6)
- **Complexity Requirements**:
  - Lowercase: `matches(/[a-z]/)`
  - Uppercase: `matches(/[A-Z]/)`
  - Number: `matches(/[0-9]/)`
  - Special Char: `matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)`

**Functions Used**:
- `validatePasswordStrength(password)` - Custom validation function
- `body("password").matches()` - Express-validator pattern matching

**Files**:
- `backend/middleware/validators.js` - Enhanced password validation
- `backend/utils/authUtils.js` - Password strength validation function

---

### 3. Two-Factor Authentication (2FA)

**Libraries**: `speakeasy`, `qrcode`, `nodemailer`

**Implementation**:
- **TOTP**: Time-based One-Time Password using `speakeasy.generateSecret()`
- **QR Code**: Generated using `QRCode.toDataURL(secret.otpauth_url)`
- **Backup Codes**: 10 codes generated using `crypto.randomBytes()`
- **Verification**: `speakeasy.totp.verify()` with 2-time-step window

**Functions Used**:
- `speakeasy.generateSecret({ name, issuer })` - Generates TOTP secret
- `QRCode.toDataURL(secret.otpauth_url)` - Generates QR code
- `speakeasy.totp.verify({ secret, encoding, token, window })` - Verifies code

**Models**:
- `backend/models/userModel.js` - Added fields:
  - `twoFactorEnabled: Boolean`
  - `twoFactorSecret: String` (base32 encoded)
  - `twoFactorBackupCodes: [String]`

**API Endpoints**:
- `POST /api/auth/2fa/setup` - Setup 2FA
  - Returns: `{ secret, qrCode, backupCodes }`
- `POST /api/auth/2fa/verify` - Verify and enable 2FA
  - Body: `{ code: string }`
- `POST /api/auth/2fa/disable` - Disable 2FA
  - Body: `{ password: string }` (verification required)

**Files**:
- `backend/controllers/authController.js` - 2FA setup/verify/disable
- `backend/routes/authRoute.js` - 2FA routes
- `backend/controllers/userController.js` - Login with 2FA support

---

### 4. Session Management & Token Blacklist

**Library**: `jsonwebtoken`, `mongoose`

**Implementation**:
- **Token Blacklist**: Stores revoked tokens in `TokenBlacklist` model
- **Logout**: Adds access token to blacklist, revokes refresh token
- **Verification**: `authMiddleware` checks blacklist before verifying token

**Functions Used**:
- `jwt.verify()` - Verifies token and extracts expiry
- `TokenBlacklist.create()` - Adds token to blacklist

**Models**:
- `backend/models/tokenBlacklistModel.js` - Stores revoked tokens with TTL

**API Endpoints**:
- `POST /api/user/logout` - Logout and revoke tokens
  - Headers: `{ token: accessToken }`
  - Body: `{ refreshToken: string }` (optional)

**Files**:
- `backend/middleware/auth.js` - Checks token blacklist
- `backend/controllers/userController.js` - Logout function
- `backend/routes/userRoute.js` - Logout route

---

### 5. CSRF Protection

**Library**: `crypto`, `mongoose`

**Implementation**:
- **Token Generation**: `crypto.randomBytes(32).toString('hex')`
- **Storage**: Tokens stored in `CSRFToken` model with 24-hour expiry
- **Validation**: Middleware validates token on state-changing operations
- **Hashing**: Tokens hashed using `crypto.createHash('sha256')` before storage

**Functions Used**:
- `generateSecureToken(32)` - Generates 32-byte token
- `hashToken(token)` - Hashes token for storage

**Models**:
- `backend/models/csrfTokenModel.js` - Stores CSRF tokens with TTL

**API Endpoints**:
- `GET /api/auth/csrf-token` - Generate CSRF token
  - Returns: `{ csrfToken: string, expiresAt: Date }`

**Files**:
- `backend/middleware/csrfMiddleware.js` - CSRF validation
- `backend/controllers/authController.js` - CSRF token generation
- `backend/routes/authRoute.js` - CSRF route

---

### 6. Account Lockout

**Library**: `bcrypt`, `nodemailer`

**Implementation**:
- **Failed Attempts**: Tracks in `user.loginAttempts`
- **Lockout**: After 5 failed attempts, locks for 30 minutes
- **Auto-Reset**: Attempts reset after lockout period
- **Email Notification**: Sends lockout email using `sendAccountLockoutEmail()`

**Functions Used**:
- `handleFailedLogin(user, maxAttempts, lockoutDurationMinutes)` - Increments attempts
- `isAccountLocked(user)` - Checks if account is locked
- `resetLoginAttempts(user)` - Resets attempts on successful login
- `sendAccountLockoutEmail()` - Sends notification email

**Models**:
- `backend/models/userModel.js` - Added fields:
  - `loginAttempts: Number`
  - `lastLoginAttempt: Date`
  - `accountLockedUntil: Date`

**Files**:
- `backend/utils/authUtils.js` - Lockout functions
- `backend/utils/emailService.js` - Lockout email
- `backend/controllers/userController.js` - Login with lockout check

---

### 7. Password Reset

**Libraries**: `crypto`, `nodemailer`, `bcrypt`

**Implementation**:
- **Token Generation**: `crypto.randomBytes(32).toString('hex')`
- **Token Storage**: Stored in `PasswordResetToken` model, hashed before storage
- **Email Delivery**: `nodemailer` sends reset link
- **Expiry**: 1 hour
- **One-time Use**: Token marked as used after reset

**Functions Used**:
- `generateSecureToken(32)` - Generates reset token
- `hashToken(token)` - Hashes token for storage
- `sendPasswordResetEmail(email, token, resetUrl)` - Sends email
- `bcrypt.hash()` - Hashes new password

**Models**:
- `backend/models/passwordResetTokenModel.js` - Stores reset tokens with TTL

**API Endpoints**:
- `POST /api/auth/password-reset/request` - Request password reset
  - Body: `{ email: string }`
- `POST /api/auth/password-reset/reset` - Reset password
  - Body: `{ token: string, newPassword: string }`

**Files**:
- `backend/controllers/authController.js` - Password reset functions
- `backend/utils/emailService.js` - Email sending
- `backend/routes/authRoute.js` - Password reset routes

---

### 8. JWT Secret Rotation

**Library**: `jsonwebtoken`, `crypto`

**Implementation**:
- **Multiple Secrets**: Supports current and previous secrets
- **Verification**: Tries current secret, then previous (for rotation period)
- **Rotation**: `rotateSecrets()` generates new secret

**Functions Used**:
- `verifyTokenWithRotation(token, tokenType)` - Verifies with rotation support
- `getCurrentSecret()` - Gets current JWT secret
- `getPreviousSecret()` - Gets previous JWT secret (for rotation)
- `rotateSecrets()` - Generates new secret (admin function)

**Environment Variables**:
- `JWT_SECRET` - Current secret
- `JWT_SECRET_PREVIOUS` - Previous secret (during rotation)
- `JWT_REFRESH_SECRET` - Refresh token secret

**Files**:
- `backend/utils/jwtRotation.js` - Rotation utilities
- `backend/middleware/auth.js` - Uses rotation verification

---

## 🔄 PART 2: Idempotency Implementation

### Overview

**Library**: `crypto`, `mongoose`

**Purpose**: Prevents duplicate operations when the same request is made multiple times.

### Implementation Details

**Middleware**: `backend/middleware/idempotencyMiddleware.js`

**Functions Used**:
- `crypto.randomUUID()` - Generates idempotency keys
- `generateIdempotencyKey()` - Utility function for key generation
- `hashToken(key)` - Hashes key for storage (using `crypto.createHash('sha256')`)

**Model**: `backend/models/idempotencyModel.js`
- **Fields**: `key`, `userId`, `endpoint`, `response`, `statusCode`, `createdAt`
- **Indexes**: 
  - Unique compound: `(key, userId, endpoint)`
  - TTL: `createdAt` (24 hours)

**How It Works**:
1. Client sends `Idempotency-Key` header
2. Middleware checks if key exists in database
3. If exists: Returns cached response
4. If not: Processes request, caches response
5. Response stored with same status code and body

### Protected Routes (18 Total)

#### Financial Operations:
1. `POST /api/order/place` - Order placement
2. `POST /api/order/create` - Admin order creation
3. `POST /api/payment/create` - Payment creation
4. `POST /api/payment/process/:paymentId` - Payment processing
5. `POST /api/payment/admin/:paymentId/refund` - Payment refund
6. `POST /api/payment/admin/create` - Admin payment creation

#### User Data Operations:
7. `POST /api/food/add` - Food item creation
8. `POST /api/cart/add` - Add to cart
9. `POST /api/cart/remove` - Remove from cart
10. `POST /api/support/ticket` - Support ticket creation
11. `POST /api/support/agent` - Support agent creation
12. `POST /api/address` - Address creation
13. `POST /api/review` - Review creation
14. `POST /api/wishlist` - Wishlist add
15. `POST /api/user-management/users` - User creation (admin)
16. `POST /api/coupon/validate` - Coupon application
17. `POST /api/coupon` - Coupon creation (admin)
18. `POST /api/profile/picture` - Profile picture upload

**Files**:
- `backend/middleware/idempotencyMiddleware.js` - Middleware implementation
- `backend/models/idempotencyModel.js` - Database model
- All route files updated with idempotency middleware

---

## 🛡️ PART 3: Comprehensive Data Protection

### 1. Field-Level Encryption

**Library**: Node.js `crypto` (built-in)

**Algorithm**: AES-256-CBC

**Implementation**:
- **Encryption**: `crypto.createCipheriv(ALGORITHM, key, iv)`
- **Decryption**: `crypto.createDecipheriv(ALGORITHM, key, iv)`
- **IV Generation**: `crypto.randomBytes(16)` for each encryption
- **Key Management**: 32-byte key from `ENCRYPTION_KEY` environment variable

**Functions Used**:
- `encryptField(text)` - Encrypts single field
- `decryptField(encryptedText)` - Decrypts single field
- `encryptObjectFields(obj, fieldsToEncrypt)` - Encrypts object fields
- `decryptObjectFields(obj, fieldsToDecrypt)` - Decrypts object fields

**Encrypted Fields**:
- User phone numbers
- Address phone numbers
- Address email addresses
- Address lines (addressLine1, addressLine2)
- Pincodes

**Automatic Processing**:
- **Pre-save Hook**: `userSchema.pre('save')` - Encrypts before saving
- **Post-find Hook**: `userSchema.post('find')` - Decrypts after retrieving
- **Post-findOne Hook**: `userSchema.post('findOne')` - Decrypts after retrieving

**Files**:
- `backend/utils/encryptionUtils.js` - Encryption/decryption functions
- `backend/models/userModel.js` - Encryption hooks
- `backend/models/orderModel.js` - Address encryption hooks

---

### 2. PII Masking in Activity Logs

**Implementation**:
- **Email Masking**: `ab***@domain.com` (first 2 chars + domain)
- **Phone Masking**: `12***34` (first 2 + last 2 digits)
- **Address Masking**: `123 Main St***` (first 10 chars)
- **Pincode Masking**: `12***` (first 2 digits)

**Functions Used**:
- `sanitizeRequestBody(body)` - Masks PII in request body before logging

**Files**:
- `backend/middleware/activityLogger.js` - Enhanced sanitization function

---

### 3. Response Data Masking

**Library**: Custom utilities

**Implementation**:
- **Admin List Views**: PII partially masked by default
- **Full Data Access**: Use `?fullData=true` query parameter
- **User's Own Data**: Always shows full data

**Functions Used**:
- `maskEmail(email)` - Masks email address
- `maskPhone(phone)` - Masks phone number
- `maskAddress(address)` - Masks address line
- `maskPincode(pincode)` - Masks pincode
- `maskUserForAdmin(user, includeFullData)` - Masks user object
- `maskOrderForAdmin(order, includeFullData)` - Masks order object

**Middleware**: `backend/middleware/dataMaskingMiddleware.js`
- Automatically masks responses for admin list views
- Can be bypassed with `?fullData=true`

**Files**:
- `backend/utils/dataMaskingUtils.js` - Masking functions
- `backend/middleware/dataMaskingMiddleware.js` - Response masking middleware
- `backend/controllers/userManagementController.js` - Uses masking
- `backend/controllers/orderController.js` - Uses masking

---

### 4. Data Anonymization

**Library**: `crypto`, `mongoose`

**Implementation**:
- **Email**: `deleted_<hash>@deleted.local`
- **Name**: `Deleted User <hash>`
- **Phone**: Hashed value
- **Addresses**: Removed completely
- **Profile Picture**: Removed

**Functions Used**:
- `hashPII(text, salt)` - One-way hash for anonymization
- `anonymizeUser(userId)` - Anonymizes user and related data
- `anonymizeUserData(userData)` - Anonymizes user object

**Models Updated**:
- `userModel` - Anonymized fields
- `orderModel` - Address anonymization
- `reviewModel` - User name/avatar anonymization
- `UserActivity` - User info anonymization

**Files**:
- `backend/utils/dataAnonymization.js` - Anonymization functions
- `backend/controllers/gdprController.js` - Anonymization endpoints

---

### 5. GDPR Compliance Features

**Libraries**: `fs`, `path`, `bcrypt`, `crypto`

#### Right to Data Portability

**Functions Used**:
- `exportUserData(userId)` - Exports all user data
- `fs.writeFileSync()` - Saves export to file
- `fs.readdirSync()` - Lists export files
- `fs.unlinkSync()` - Deletes old export files

**API Endpoints**:
- `GET /api/gdpr/export` - Export user data
  - Returns: JSON data + download URL
- `GET /api/gdpr/download/:filename` - Download export file

#### Right to be Forgotten

**Functions Used**:
- `requestDataDeletion()` - Marks deletion request
- `deleteUserData(userId)` - Deletes user data completely
- `bcrypt.compare()` - Verifies password before deletion

**API Endpoints**:
- `POST /api/gdpr/delete-request` - Request data deletion
  - Body: `{ password: string }`
  - 30-day waiting period
- `DELETE /api/gdpr/delete/:userId` - Delete user data (admin only)

#### Data Anonymization

**API Endpoints**:
- `POST /api/gdpr/anonymize` - Anonymize own data
- `POST /api/gdpr/anonymize/:userId` - Anonymize user (admin)

**Files**:
- `backend/controllers/gdprController.js` - All GDPR functions
- `backend/routes/gdprRoute.js` - GDPR routes
- `backend/utils/dataAnonymization.js` - Core anonymization logic

---

### 6. HTTPS Enforcement

**Library**: Custom middleware

**Implementation**:
- **Production**: Redirects HTTP to HTTPS
- **Development**: Disabled
- **Check**: `req.secure` or `req.headers['x-forwarded-proto'] === 'https'`

**Functions Used**:
- `httpsEnforcement(req, res, next)` - Middleware function
- `res.redirect(301, httpsUrl)` - Redirects to HTTPS

**Files**:
- `backend/middleware/httpsEnforcement.js` - HTTPS middleware
- `backend/server.js` - Applied in production

---

### 7. Data Retention Policies

**Library**: `node-cron`, `mongoose`, `fs`

**Implementation**:
- **Scheduled Jobs**: `cron.schedule('0 2 * * *', callback)` - Daily at 2 AM
- **Retention Periods**:
  - Activity Logs: 365 days
  - Export Files: 7 days
  - Inactive Users: 730 days
  - Anonymized Users: 90 days

**Functions Used**:
- `cleanupActivityLogs()` - Deletes old activity logs
- `cleanupExportFiles()` - Deletes old export files
- `anonymizeInactiveUsers()` - Anonymizes inactive users
- `deleteAnonymizedUsers()` - Deletes anonymized users
- `runDataRetentionCleanup()` - Runs all cleanup tasks

**Scheduled Job**:
- **Cron Expression**: `'0 2 * * *'` (2 AM daily)
- **Enabled**: `ENABLE_SCHEDULED_JOBS=true` in .env

**Files**:
- `backend/utils/dataRetention.js` - Retention functions
- `backend/utils/scheduledJobs.js` - Cron job scheduling
- `backend/scripts/dataRetentionJob.js` - Manual cleanup script
- `backend/server.js` - Initializes scheduled jobs

---

## 📋 Complete API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/user/register` | Register new user | No |
| POST | `/api/user/login` | Login user | No |
| POST | `/api/user/refresh` | Refresh access token | No |
| POST | `/api/user/logout` | Logout user | Yes |

### 2FA Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/2fa/setup` | Setup 2FA | Yes |
| POST | `/api/auth/2fa/verify` | Verify and enable 2FA | Yes |
| POST | `/api/auth/2fa/disable` | Disable 2FA | Yes |

### Password Reset Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/password-reset/request` | Request password reset | No |
| POST | `/api/auth/password-reset/reset` | Reset password with token | No |

### CSRF Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/auth/csrf-token` | Generate CSRF token | Yes |

### GDPR Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/gdpr/export` | Export user data | Yes |
| GET | `/api/gdpr/download/:filename` | Download export file | Yes |
| POST | `/api/gdpr/delete-request` | Request data deletion | Yes |
| POST | `/api/gdpr/anonymize` | Anonymize own data | Yes |
| POST | `/api/gdpr/anonymize/:userId` | Anonymize user (admin) | Yes (Admin) |
| DELETE | `/api/gdpr/delete/:userId` | Delete user data (admin) | Yes (Admin) |

---

## 🔧 Environment Variables

### Required Variables:

```env
# JWT Secrets
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key (optional, defaults to JWT_SECRET)
JWT_SECRET_PREVIOUS=previous-secret-for-rotation (optional)

# Encryption
ENCRYPTION_KEY=your-32-byte-hex-key (generate with: openssl rand -hex 32)

# Password Hashing
SALT=10 (bcrypt salt rounds)

# Email Configuration
EMAIL_SERVICE=gmail (or 'smtp')
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com

# SMTP Configuration (alternative)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Data Retention (days)
ACTIVITY_RETENTION_DAYS=365
INACTIVE_USER_RETENTION_DAYS=730
ANONYMIZED_USER_RETENTION_DAYS=90

# Scheduled Jobs
ENABLE_SCHEDULED_JOBS=true

# Environment
NODE_ENV=production (for HTTPS enforcement)
```

---

## 📁 File Structure

### New Files Created:

#### Models:
- `backend/models/refreshTokenModel.js`
- `backend/models/tokenBlacklistModel.js`
- `backend/models/passwordResetTokenModel.js`
- `backend/models/csrfTokenModel.js`

#### Utilities:
- `backend/utils/authUtils.js` - Authentication utilities
- `backend/utils/emailService.js` - Email service
- `backend/utils/jwtRotation.js` - JWT rotation
- `backend/utils/encryptionUtils.js` - Encryption/decryption
- `backend/utils/dataMaskingUtils.js` - Data masking
- `backend/utils/dataAnonymization.js` - Data anonymization
- `backend/utils/dataRetention.js` - Data retention policies
- `backend/utils/scheduledJobs.js` - Scheduled jobs

#### Controllers:
- `backend/controllers/authController.js` - Auth features (2FA, password reset, CSRF)
- `backend/controllers/gdprController.js` - GDPR compliance

#### Middleware:
- `backend/middleware/csrfMiddleware.js` - CSRF protection
- `backend/middleware/httpsEnforcement.js` - HTTPS enforcement
- `backend/middleware/dataMaskingMiddleware.js` - Response masking

#### Routes:
- `backend/routes/authRoute.js` - Auth routes
- `backend/routes/gdprRoute.js` - GDPR routes

#### Scripts:
- `backend/scripts/dataRetentionJob.js` - Manual cleanup script

### Modified Files:

#### Models:
- `backend/models/userModel.js` - Added 2FA, lockout, anonymization fields, encryption hooks
- `backend/models/orderModel.js` - Added address encryption hooks

#### Controllers:
- `backend/controllers/userController.js` - Enhanced login/register with refresh tokens, 2FA, lockout
- `backend/controllers/userManagementController.js` - Added data masking
- `backend/controllers/orderController.js` - Added data masking
- `backend/controllers/profileController.js` - Encryption support
- `backend/controllers/addressController.js` - Encryption support

#### Middleware:
- `backend/middleware/auth.js` - Token blacklist checking, rotation support
- `backend/middleware/validators.js` - Enhanced password validation
- `backend/middleware/activityLogger.js` - Enhanced PII masking

#### Routes:
- `backend/routes/userRoute.js` - Added refresh/logout routes
- `backend/routes/paymentRoute.js` - Added idempotency
- `backend/routes/orderRoute.js` - Added idempotency
- `backend/routes/supportRoute.js` - Added idempotency
- `backend/routes/addressRoute.js` - Added idempotency
- `backend/routes/reviewRoute.js` - Added idempotency
- `backend/routes/wishlistRoute.js` - Added idempotency
- `backend/routes/userManagementRoute.js` - Added idempotency
- `backend/routes/couponRoute.js` - Added idempotency
- `backend/routes/profileRoute.js` - Added idempotency

#### Server:
- `backend/server.js` - Added auth routes, GDPR routes, HTTPS enforcement, scheduled jobs

---

## 🔄 Data Flow Examples

### User Registration Flow:
```
1. User submits: { name, email, password }
2. Password validation (strength check)
3. Password hashed: bcrypt.hash(password, salt)
4. User created in database
5. Access token generated: jwt.sign({ id }, JWT_SECRET, { expiresIn: '15m' })
6. Refresh token generated: jwt.sign({ id }, JWT_REFRESH_SECRET, { expiresIn: '7d' })
7. Refresh token hashed: crypto.createHash('sha256').update(token).digest('hex')
8. Refresh token stored in database
9. Response: { accessToken, refreshToken }
```

### Login with 2FA Flow:
```
1. User submits: { email, password }
2. Account lockout check
3. Password verification: bcrypt.compare(password, hash)
4. Failed login handling (increment attempts, lock if needed)
5. If 2FA enabled:
   a. Check for twoFactorCode
   b. Verify: speakeasy.totp.verify({ secret, token, window: 2 })
   c. Or check backup codes
6. Reset login attempts on success
7. Generate tokens
8. Response: { accessToken, refreshToken }
```

### Address Storage Flow:
```
1. User submits address data
2. Pre-save hook triggered:
   - encryptField(phone) → AES-256 encryption
   - encryptField(email) → AES-256 encryption
   - encryptField(addressLine1) → AES-256 encryption
   - encryptField(pincode) → AES-256 encryption
3. Encrypted data saved to database
4. On retrieval:
   - Post-find hook triggered
   - decryptField() for each encrypted field
   - Plaintext returned to application
```

### Idempotency Flow:
```
1. Client generates: idempotencyKey = crypto.randomUUID()
2. Request sent with header: { 'Idempotency-Key': idempotencyKey }
3. Middleware checks database for key
4. If found: Return cached response (same status + body)
5. If not found:
   a. Process request
   b. Hash key: crypto.createHash('sha256').update(key).digest('hex')
   c. Store response in database
   d. Return response
```

### GDPR Data Export Flow:
```
1. User requests: GET /api/gdpr/export
2. Fetch user data from all collections:
   - userModel.findById()
   - orderModel.find({ userId })
   - reviewModel.find({ userId })
   - paymentModel.find({ userId })
   - UserActivity.find({ userId })
3. Compile into JSON object
4. Save to file: fs.writeFileSync()
5. Return: { data, downloadUrl, expiresAt }
```

---

## 🛡️ Security Best Practices

### For Developers:

1. **Encryption Key**: 
   - Generate: `openssl rand -hex 32`
   - Store securely, never commit to version control
   - Keep backup (data cannot be decrypted without it)

2. **Password Storage**:
   - Always use `.select('-password')` in queries
   - Never log passwords
   - Use bcrypt for hashing

3. **Token Management**:
   - Store refresh tokens securely (httpOnly cookies recommended)
   - Implement token rotation
   - Revoke tokens on logout

4. **Data Masking**:
   - Always mask PII in admin list views
   - Use `?fullData=true` only when necessary
   - Logs should never contain full PII

5. **Idempotency**:
   - Always generate new keys for unique operations
   - Reuse keys only when retrying same operation
   - Don't reuse keys across different operations

### For Production:

1. **HTTPS**: Always use HTTPS in production
2. **Environment Variables**: Never commit .env file
3. **Database**: Use MongoDB authentication
4. **Rate Limiting**: Already implemented
5. **Monitoring**: Monitor encryption/decryption errors
6. **Backups**: Regular database backups
7. **Key Rotation**: Rotate JWT secrets every 90 days

---

## 📊 Feature Summary Table

| Feature | Library | Key Functions | Status |
|---------|---------|---------------|--------|
| Refresh Tokens | jsonwebtoken, crypto | jwt.sign(), hashToken() | ✅ |
| Password Validation | express-validator | matches(), isLength() | ✅ |
| 2FA | speakeasy, qrcode | generateSecret(), totp.verify(), toDataURL() | ✅ |
| Session Management | jsonwebtoken, mongoose | TokenBlacklist | ✅ |
| CSRF Protection | crypto, mongoose | generateSecureToken(), hashToken() | ✅ |
| Account Lockout | bcrypt, mongoose | handleFailedLogin(), isAccountLocked() | ✅ |
| Password Reset | crypto, nodemailer, bcrypt | generateSecureToken(), sendPasswordResetEmail() | ✅ |
| JWT Rotation | jsonwebtoken, crypto | verifyTokenWithRotation() | ✅ |
| Idempotency | crypto, mongoose | randomUUID(), hashToken() | ✅ |
| Field Encryption | crypto | createCipheriv(), createDecipheriv() | ✅ |
| PII Masking | Custom | maskEmail(), maskPhone(), maskAddress() | ✅ |
| Data Anonymization | crypto, mongoose | hashPII(), anonymizeUser() | ✅ |
| GDPR Compliance | fs, path, bcrypt | exportUserData(), deleteUserData() | ✅ |
| HTTPS Enforcement | Custom | httpsEnforcement() | ✅ |
| Data Retention | node-cron, mongoose, fs | cleanupActivityLogs(), cron.schedule() | ✅ |

---

## ✅ Implementation Checklist

- [x] Refresh token mechanism
- [x] Enhanced password validation
- [x] Two-factor authentication
- [x] Session management with token blacklist
- [x] CSRF protection
- [x] Account lockout
- [x] Password reset
- [x] JWT secret rotation
- [x] Idempotency on all critical routes
- [x] Field-level encryption
- [x] PII masking in logs
- [x] Response data masking
- [x] Data anonymization
- [x] GDPR compliance features
- [x] HTTPS enforcement
- [x] Data retention policies

---

## 🚀 Getting Started

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment**:
   ```bash
   # Generate encryption key
   openssl rand -hex 32
   
   # Add to .env file
   ENCRYPTION_KEY=<generated-key>
   JWT_SECRET=<your-jwt-secret>
   JWT_REFRESH_SECRET=<your-refresh-secret>
   EMAIL_USER=<your-email>
   EMAIL_PASSWORD=<your-app-password>
   ```

3. **Start Server**:
   ```bash
   npm run server
   ```

4. **Run Data Retention Cleanup** (optional):
   ```bash
   node scripts/dataRetentionJob.js
   ```

---

## 📝 Notes

- All encryption/decryption is automatic via Mongoose hooks
- Data masking is applied automatically in admin list views
- Idempotency is optional (requests work without keys)
- GDPR features require email service configuration
- Scheduled jobs run automatically if `ENABLE_SCHEDULED_JOBS=true`
- HTTPS enforcement only active in production

---

**All features are production-ready and fully implemented!** 🎉

