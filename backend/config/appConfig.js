/**
 * Central feature flags and API settings (Phase 0).
 * Prefer reading from here instead of scattering process.env checks.
 */
export const appConfig = {
  get apiVersion() {
    return (process.env.API_VERSION || "v1").replace(/^\/+/, "");
  },

  /** When true with REDIS_URL, BullMQ worker + queues start */
  get enableJobQueue() {
    return process.env.ENABLE_JOB_QUEUE === "true";
  },

  /** Future marketplace features */
  get enableMarketplace() {
    return process.env.ENABLE_MARKETPLACE === "true";
  },

  get enableScheduledJobs() {
    return process.env.ENABLE_SCHEDULED_JOBS === "true";
  },

  /** Scheduled order advancement repeat interval (ms) */
  get scheduledOrderAdvancementEveryMs() {
    const v = Number(process.env.SCHEDULED_ORDER_ADVANCEMENT_EVERY_MS);
    if (!Number.isFinite(v) || v < 10_000) return 60_000;
    return Math.floor(v);
  },

  /** Max orders to advance per scheduled sweep */
  get scheduledOrderAdvancementLimit() {
    const v = Number(process.env.SCHEDULED_ORDER_ADVANCEMENT_LIMIT);
    if (!Number.isFinite(v) || v < 1) return 100;
    return Math.min(500, Math.floor(v));
  },

  /** Grace window before counting pending scheduled orders as overdue */
  get scheduledOrderOverdueGraceMinutes() {
    const v = Number(process.env.SCHEDULED_ORDER_OVERDUE_GRACE_MINUTES);
    if (!Number.isFinite(v) || v < 0) return 15;
    return Math.min(180, Math.floor(v));
  },

  /** Max order IDs returned in dry-run advancement responses (full count still in dueOrderCount) */
  get scheduledOrderDryRunIdListCap() {
    const v = Number(process.env.SCHEDULED_ORDER_DRY_RUN_ID_CAP);
    if (!Number.isFinite(v) || v < 1) return 100;
    return Math.min(500, Math.floor(v));
  },

  /** Max failed order details returned per advancement sweep */
  get scheduledOrderAdvancementFailureListCap() {
    const v = Number(process.env.SCHEDULED_ORDER_FAILURE_LIST_CAP);
    if (!Number.isFinite(v) || v < 1) return 25;
    return Math.min(200, Math.floor(v));
  },

  /** Append-only wallet ledger (refunds, top-ups); balance = sum(entries) */
  get enableWalletLedger() {
    return process.env.ENABLE_WALLET_LEDGER !== "false";
  },

  /** Time-window + optional Redis override; see dynamicPricingService */
  get enableDynamicPricing() {
    return process.env.ENABLE_DYNAMIC_PRICING === "true";
  },

  /** When true, only KYC-approved restaurants appear in public lists and accept orders */
  get requireRestaurantKycForOrders() {
    return process.env.REQUIRE_RESTAURANT_KYC_FOR_ORDERS === "true";
  },

  /** Per-IP/user fraud velocity guards (register/order/dispute) */
  get enableFraudVelocityLimits() {
    return process.env.ENABLE_FRAUD_VELOCITY_LIMITS !== "false";
  },

  /** Minimum wait between Razorpay order-session creations for one payment */
  get razorpayCreateOrderCooldownMs() {
    const v = Number(process.env.RAZORPAY_CREATE_ORDER_COOLDOWN_MS);
    if (!Number.isFinite(v) || v < 1_000) return 15_000;
    return Math.min(120_000, Math.floor(v));
  },

  /** Max checkout session attempts per payment in a rolling hour */
  get razorpayCreateOrderMaxAttemptsPerHour() {
    const v = Number(process.env.RAZORPAY_CREATE_ORDER_MAX_ATTEMPTS_PER_HOUR);
    if (!Number.isFinite(v) || v < 1) return 6;
    return Math.min(30, Math.floor(v));
  },

  /** Max cooldown between checkout session retries (ms) */
  get razorpayCreateOrderCooldownMaxMs() {
    const v = Number(process.env.RAZORPAY_CREATE_ORDER_COOLDOWN_MAX_MS);
    if (!Number.isFinite(v) || v < 1_000) return 300_000;
    return Math.min(900_000, Math.floor(v));
  },

  /** Max sample rows per issue type in extended reconciliation JSON/CSV */
  get reconciliationDepthSampleCap() {
    const v = Number(process.env.RECONCILIATION_DEPTH_SAMPLE_CAP);
    if (!Number.isFinite(v) || v < 1) return 50;
    return Math.min(200, Math.floor(v));
  },

  /** Non-COD payments still pending after this many hours are flagged as stale */
  get reconciliationStalePendingHours() {
    const v = Number(process.env.RECONCILIATION_STALE_PENDING_HOURS);
    if (!Number.isFinite(v) || v < 1) return 24;
    return Math.min(168, Math.floor(v));
  },

  /** Percent of (items − coupon discount) added as platform service fee at checkout (0 = off) */
  get checkoutServiceFeePercent() {
    const v = Number(process.env.CHECKOUT_SERVICE_FEE_PERCENT);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(25, v);
  },

  /** Cap on service fee amount (INR) */
  get checkoutServiceFeeMaxInr() {
    const v = Number(process.env.CHECKOUT_SERVICE_FEE_MAX_INR);
    if (!Number.isFinite(v) || v < 0) return 50;
    return Math.min(500, Math.floor(v));
  },

  /** Max tip as % of items subtotal (before delivery/discounts) */
  get checkoutTipMaxPercentOfSubtotal() {
    const v = Number(process.env.CHECKOUT_TIP_MAX_PERCENT);
    if (!Number.isFinite(v) || v < 0) return 25;
    return Math.min(50, Math.floor(v));
  },

  /** Absolute cap on tip (INR) */
  get checkoutTipMaxFixedInr() {
    const v = Number(process.env.CHECKOUT_TIP_MAX_INR);
    if (!Number.isFinite(v) || v < 0) return 500;
    return Math.min(5000, Math.floor(v));
  },

  /** Phase 5: map ETA provider (none|google) */
  get deliveryEtaProvider() {
    const v = String(process.env.DELIVERY_ETA_PROVIDER || "none").trim().toLowerCase();
    if (v === "google") return "google";
    return "none";
  },

  /** Google Maps API key for Distance Matrix ETA */
  get deliveryEtaGoogleApiKey() {
    return String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  },

  /** In-memory ETA cache TTL (ms) */
  get deliveryEtaCacheTtlMs() {
    const v = Number(process.env.DELIVERY_ETA_CACHE_TTL_MS);
    if (!Number.isFinite(v) || v < 1000) return 120000;
    return Math.min(900000, Math.floor(v));
  },

  /** Phase 5: delivery OTP SMS provider (none|mock|twilio) */
  get deliveryOtpSmsProvider() {
    const v = String(process.env.DELIVERY_OTP_SMS_PROVIDER || "none")
      .trim()
      .toLowerCase();
    if (v === "twilio") return "twilio";
    if (v === "mock") return "mock";
    return "none";
  },

  /** Twilio sender number for OTP SMS */
  get twilioFromPhone() {
    return String(process.env.TWILIO_FROM_PHONE || "").trim();
  },

  /** Delivery OTP validity in minutes */
  get deliveryOtpTtlMinutes() {
    const v = Number(process.env.DELIVERY_OTP_TTL_MINUTES);
    if (!Number.isFinite(v) || v < 1) return 15;
    return Math.min(60, Math.floor(v));
  },

  /** Phase 6: max active SSE connections globally */
  get sseMaxClientsGlobal() {
    const v = Number(process.env.SSE_MAX_CLIENTS_GLOBAL);
    if (!Number.isFinite(v) || v < 1) return 2000;
    return Math.min(20000, Math.floor(v));
  },

  /** Phase 6: max SSE connections per user */
  get sseMaxClientsPerUser() {
    const v = Number(process.env.SSE_MAX_CLIENTS_PER_USER);
    if (!Number.isFinite(v) || v < 1) return 5;
    return Math.min(50, Math.floor(v));
  },

  /** Phase 6: SSE heartbeat interval in milliseconds */
  get sseHeartbeatIntervalMs() {
    const v = Number(process.env.SSE_HEARTBEAT_INTERVAL_MS);
    if (!Number.isFinite(v) || v < 5000) return 30000;
    return Math.min(120000, Math.floor(v));
  },

  /** Phase 6: idle timeout for SSE streams */
  get sseIdleTimeoutMs() {
    const v = Number(process.env.SSE_IDLE_TIMEOUT_MS);
    if (!Number.isFinite(v) || v < 60000) return 300000;
    return Math.min(1800000, Math.floor(v));
  },

  /** Phase 6: WebSocket server flag */
  get enableWebsocket() {
    return process.env.ENABLE_WEBSOCKET !== "false";
  },

  /** Phase 6 push provider (none|mock|expo) */
  get pushProvider() {
    const v = String(process.env.PUSH_PROVIDER || "none").trim().toLowerCase();
    if (v === "mock") return "mock";
    if (v === "expo") return "expo";
    return "none";
  },

  /** Phase 9: emit structured request logs to stdout */
  get enableStructuredRequestLogs() {
    return process.env.ENABLE_STRUCTURED_REQUEST_LOGS !== "false";
  },

  /** Phase 9: probabilistic sampling for non-error/non-slow requests (0..1) */
  get requestLogSampleRate() {
    const v = Number(process.env.REQUEST_LOG_SAMPLE_RATE);
    if (!Number.isFinite(v) || v < 0) return 0.15;
    return Math.min(1, v);
  },

  /** Phase 9: always log requests slower than this threshold */
  get requestLogSlowMs() {
    const v = Number(process.env.REQUEST_LOG_SLOW_MS);
    if (!Number.isFinite(v) || v < 100) return 1200;
    return Math.min(30000, Math.floor(v));
  },

  /** Phase 9: append HTTP analytics events to Mongo */
  get enableAnalyticsEvents() {
    return process.env.ENABLE_ANALYTICS_EVENTS !== "false";
  },

  /** Phase 9: sample rate for persisted HTTP analytics events */
  get analyticsEventSampleRate() {
    const v = Number(process.env.ANALYTICS_EVENT_SAMPLE_RATE);
    if (!Number.isFinite(v) || v < 0) return 0.1;
    return Math.min(1, v);
  },

  /** Phase 9: object storage provider (local|s3) */
  get objectStorageProvider() {
    const v = String(process.env.OBJECT_STORAGE_PROVIDER || "local")
      .trim()
      .toLowerCase();
    if (v === "s3") return "s3";
    return "local";
  },

  get objectStoragePublicBaseUrl() {
    return String(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || "").trim();
  },

  get objectStorageS3Bucket() {
    return String(process.env.OBJECT_STORAGE_S3_BUCKET || "").trim();
  },

  get objectStorageS3Region() {
    return String(process.env.OBJECT_STORAGE_S3_REGION || "auto").trim();
  },

  get objectStorageS3Endpoint() {
    return String(process.env.OBJECT_STORAGE_S3_ENDPOINT || "").trim();
  },

  get objectStorageS3ForcePathStyle() {
    return String(process.env.OBJECT_STORAGE_S3_FORCE_PATH_STYLE || "true")
      .trim()
      .toLowerCase() !== "false";
  },

  get objectStorageSignedUrlTtlSec() {
    const v = Number(process.env.OBJECT_STORAGE_SIGNED_URL_TTL_SEC);
    if (!Number.isFinite(v) || v < 30) return 900;
    return Math.min(86400, Math.floor(v));
  },

  /** Tomato × Air-Tasker Wave 1: hold funds until delivery verified */
  get enableEscrowPayments() {
    return process.env.ENABLE_ESCROW_PAYMENTS === "true";
  },

  /** RazorpayX automated payouts to restaurants/drivers */
  get enableRazorpayxPayouts() {
    return process.env.ENABLE_RAZORPAYX_PAYOUTS === "true";
  },

  /** User-level KYC (drivers, restaurant owners) */
  get enableUserKyc() {
    return process.env.ENABLE_USER_KYC === "true";
  },

  /** Block payout registration until user KYC verified */
  get kycRequiredForPayout() {
    return process.env.KYC_REQUIRED_FOR_PAYOUT === "true";
  },

  /** Email OTP verification for account trust */
  get enableEmailOtp() {
    return process.env.ENABLE_EMAIL_OTP !== "false";
  },

  /** AI agent + RAG support (Phase R) */
  get enableAiAgent() {
    return process.env.ENABLE_AI_AGENT === "true";
  },

  /** Use rule-based agent when true or when GEMINI_API_KEY is missing */
  get useMockAgent() {
    return process.env.USE_MOCK_AGENT !== "false";
  },

  get agentConfidenceThreshold() {
    const v = Number(process.env.AGENT_CONFIDENCE_THRESHOLD);
    if (!Number.isFinite(v) || v <= 0) return 0.65;
    return Math.min(0.99, v);
  },

  get lowConfidenceAppendNote() {
    return process.env.AGENT_LOW_CONFIDENCE_NOTE !== "false";
  },

  get skipGeminiOnLowConfidence() {
    return process.env.AGENT_SKIP_GEMINI_ON_LOW_CONF !== "false";
  },

  /** Optional Pinecone vector RAG (requires PINECONE_API_KEY + PINECONE_INDEX) */
  get enablePineconeRag() {
    return process.env.ENABLE_PINECONE_RAG === "true";
  },

  /** Phase S: AI-assisted custom / catering order request drafts */
  get enableOrderRequestDrafts() {
    return process.env.ENABLE_ORDER_REQUEST_DRAFTS === "true";
  },

  /** Phase T: voice transcribe endpoint */
  get enableVoiceAssist() {
    return process.env.ENABLE_VOICE_ASSIST === "true";
  },

  get voiceAllowMockText() {
    return process.env.VOICE_ALLOW_MOCK_TEXT !== "false";
  },

  /** Order-scoped customer ↔ restaurant/driver chat (Phase Q) */
  get enableOrderChat() {
    return process.env.ENABLE_ORDER_CHAT !== "false";
  },

  /** Phase Y: pre-payout fraud rule engine */
  get enablePayoutFraudRules() {
    return process.env.ENABLE_PAYOUT_FRAUD_RULES !== "false";
  },

  get payoutFraudBlockOnOpenDispute() {
    return process.env.PAYOUT_FRAUD_BLOCK_OPEN_DISPUTE !== "false";
  },

  get payoutFraudBlockOnChargebackFlag() {
    return process.env.PAYOUT_FRAUD_BLOCK_CHARGEBACK !== "false";
  },

  get payoutFraudBlockOnCustomerBlocked() {
    return process.env.PAYOUT_FRAUD_BLOCK_CUSTOMER_BLOCKED !== "false";
  },

  get payoutFraudBlockOnHighWarnings() {
    return process.env.PAYOUT_FRAUD_BLOCK_HIGH_WARNINGS !== "false";
  },

  get payoutFraudHighWarningsThreshold() {
    const v = Number(process.env.PAYOUT_FRAUD_WARNINGS_THRESHOLD);
    if (!Number.isFinite(v) || v < 1) return 2;
    return Math.min(3, Math.floor(v));
  },

  get payoutFraudBlockOnChargebackSegment() {
    return process.env.PAYOUT_FRAUD_BLOCK_CHARGEBACK_SEGMENT !== "false";
  },

  get payoutFraudBlockOnPayoutVelocity() {
    return process.env.PAYOUT_FRAUD_BLOCK_VELOCITY !== "false";
  },

  get payoutFraudMaxPayoutsPerUserPerHour() {
    const v = Number(process.env.PAYOUT_FRAUD_MAX_PAYOUTS_PER_USER_HOUR);
    if (!Number.isFinite(v) || v < 1) return 5;
    return Math.min(50, Math.floor(v));
  },

  /** OTP validity in seconds */
  get otpTtlSeconds() {
    const v = Number(process.env.OTP_TTL_SECONDS);
    if (!Number.isFinite(v) || v < 60) return 600;
    return Math.min(3600, Math.floor(v));
  },

  /** Max failed OTP verify attempts per challenge */
  get otpMaxAttempts() {
    const v = Number(process.env.OTP_MAX_ATTEMPTS);
    if (!Number.isFinite(v) || v < 1) return 5;
    return Math.min(10, Math.floor(v));
  },

  /** Min seconds between OTP requests for same user/purpose */
  get otpResendCooldownSeconds() {
    const v = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS);
    if (!Number.isFinite(v) || v < 30) return 60;
    return Math.min(600, Math.floor(v));
  },

  /** Local dev: log OTP to console when SMTP is not configured */
  get otpDevLogWhenNoSmtp() {
    return process.env.OTP_DEV_LOG_WHEN_NO_SMTP !== "false";
  },

  /** KYC stub auto-verify in development */
  get kycStubAutoVerify() {
    return process.env.KYC_STUB_AUTO_VERIFY === "true";
  },

  /** RazorpayX source account for payouts */
  get razorpayPayoutAccountNumber() {
    return String(process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER || "").trim();
  },

  /** KYC provider: stub | signzy */
  get kycProvider() {
    const v = String(process.env.KYC_PROVIDER || "stub").trim().toLowerCase();
    if (v === "signzy") return "signzy";
    return "stub";
  },

  /** Closed beta mode — limits scope and surfaces feedback banner */
  get betaModeEnabled() {
    return process.env.BETA_MODE_ENABLED === "true";
  },

  get betaCityLabel() {
    return String(process.env.BETA_CITY_LABEL || "Delhi NCR").trim();
  },

  /** Comma-separated delivery PIN codes allowed during closed beta */
  get betaPinCodes() {
    return String(process.env.BETA_PIN_CODES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  /** Comma-separated food categories highlighted in beta (informational) */
  get betaCategories() {
    return String(process.env.BETA_CATEGORIES || "North Indian,South Indian,Fast Food")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  /** Nav/feature toggles during closed beta (ignored when betaModeEnabled is false) */
  get betaFeatureAiAssistant() {
    return process.env.BETA_FEATURE_AI_ASSISTANT !== "false";
  },
  get betaFeatureOrderChat() {
    return process.env.BETA_FEATURE_ORDER_CHAT !== "false";
  },
  get betaFeatureGroupOrders() {
    return process.env.BETA_FEATURE_GROUP_ORDERS === "true";
  },
  get betaFeatureVoiceInput() {
    return process.env.BETA_FEATURE_VOICE_INPUT !== "false";
  },
};
