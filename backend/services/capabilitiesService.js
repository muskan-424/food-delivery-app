import { isRedisEnabled } from "../config/redis.js";
import { appConfig } from "../config/appConfig.js";
import { isRazorpayConfigured } from "./razorpayService.js";
import { isSmtpConfigured } from "../utils/emailService.js";

function envPresent(key) {
  return Boolean(String(process.env[key] || "").trim());
}

/**
 * Runtime capability matrix (Air-Tasker-style) for ops and feature introspection.
 */
export function getCapabilitiesSnapshot() {
  const razorpayKeys = isRazorpayConfigured();
  const razorpayWebhook = envPresent("RAZORPAY_WEBHOOK_SECRET");
  const razorpayxPayout =
    razorpayKeys && envPresent("RAZORPAY_PAYOUT_ACCOUNT_NUMBER");
  const gemini = envPresent("GEMINI_API_KEY");
  const kycWebhook = envPresent("KYC_WEBHOOK_SECRET");

  return {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    apiVersion: appConfig.apiVersion,
    flags: {
      enableEscrowPayments: appConfig.enableEscrowPayments,
      enableRazorpayxPayouts: appConfig.enableRazorpayxPayouts,
      enableUserKyc: appConfig.enableUserKyc,
      kycRequiredForPayout: appConfig.kycRequiredForPayout,
      enableEmailOtp: appConfig.enableEmailOtp,
      enableAiAgent: appConfig.enableAiAgent,
      useMockAgent: appConfig.useMockAgent,
      enableOrderChat: appConfig.enableOrderChat,
      enableOrderRequestDrafts: appConfig.enableOrderRequestDrafts,
      enableVoiceAssist: appConfig.enableVoiceAssist,
      enableJobQueue: appConfig.enableJobQueue,
      enableWebsocket: appConfig.enableWebsocket,
      enableWalletLedger: appConfig.enableWalletLedger,
      requireRestaurantKycForOrders: appConfig.requireRestaurantKycForOrders,
    },
    subsystems: {
      mongo: { status: "required", configured: true },
      redis: {
        status: isRedisEnabled() ? "configured" : "optional_disabled",
        configured: isRedisEnabled(),
      },
      smtp: {
        status: isSmtpConfigured() ? "configured" : "optional_missing",
        configured: isSmtpConfigured(),
      },
      razorpay: {
        status: razorpayKeys ? "configured" : "optional_missing",
        configured: razorpayKeys,
        webhook: razorpayWebhook ? "configured" : "optional_missing",
      },
      razorpayx: {
        status: razorpayxPayout ? "configured" : "optional_missing",
        configured: razorpayxPayout,
        enabled: appConfig.enableRazorpayxPayouts,
        implemented: true,
      },
      escrow: {
        status: appConfig.enableEscrowPayments ? "enabled_flag" : "disabled_flag",
        implemented: true,
      },
      userKyc: {
        status: appConfig.enableUserKyc ? "enabled_flag" : "disabled_flag",
        implemented: true,
        provider: appConfig.kycProvider,
        providerWebhook: kycWebhook ? "configured" : "optional_missing",
      },
      emailOtp: {
        status: appConfig.enableEmailOtp ? "enabled_flag" : "disabled_flag",
        implemented: true,
        requiresSmtp: true,
      },
      aiAgent: {
        status: appConfig.enableAiAgent ? "enabled_flag" : "disabled_flag",
        implemented: true,
        mockFallback: appConfig.useMockAgent,
        gemini: gemini ? "configured" : "optional_missing",
      },
      orderChat: {
        status: appConfig.enableOrderChat ? "enabled_flag" : "disabled_flag",
        implemented: true,
        requiresWebsocket: true,
      },
      orderRequestDrafts: {
        status: appConfig.enableOrderRequestDrafts ? "enabled_flag" : "disabled_flag",
        implemented: true,
        gemini: gemini ? "configured" : "optional_missing",
      },
      voiceAssist: {
        status: appConfig.enableVoiceAssist ? "enabled_flag" : "disabled_flag",
        implemented: true,
        provider: "stub",
      },
      objectStorage: {
        provider: appConfig.objectStorageProvider,
        s3Bucket: appConfig.objectStorageS3Bucket || null,
      },
    },
  };
}
