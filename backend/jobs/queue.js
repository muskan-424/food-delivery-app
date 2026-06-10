import { Queue, Worker } from "bullmq";
import { appConfig } from "../config/appConfig.js";
import notificationModel from "../models/notificationModel.js";
import userModel from "../models/userModel.js";
import { sendHtmlEmail } from "../utils/emailService.js";
import { sendSmsMessage } from "../utils/smsService.js";
import { sendPushNotification } from "../utils/pushService.js";
import { renderNotificationTemplates } from "../services/notificationTemplateService.js";
import {
  isChannelEnabled,
  mapNotificationTypeToCategory,
} from "../services/notificationPreferenceService.js";
import {
  getQueueRedis,
  getWorkerRedis,
  closeBullmqConnections,
} from "./bullmqConnection.js";

const QUEUE_NAME = "app-general";

let generalQueue = null;
let generalWorker = null;

/**
 * Start BullMQ queue + worker when ENABLE_JOB_QUEUE=true and REDIS_URL is set.
 */
export function startJobQueue() {
  if (!appConfig.enableJobQueue) {
    return null;
  }
  const queueConnection = getQueueRedis();
  const workerConnection = getWorkerRedis();
  if (!queueConnection || !workerConnection) {
    console.warn("ENABLE_JOB_QUEUE is true but REDIS_URL is missing; queue not started.");
    return null;
  }

  generalQueue = new Queue(QUEUE_NAME, { connection: queueConnection });

  generalWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "order.placed":
          console.log("[queue] order.placed", job.data?.orderId || job.id);
          return { ok: true };
        case "scheduled.data_retention": {
          console.log("[queue] scheduled.data_retention", job.id);
          const { runDataRetentionCleanup } = await import("../utils/dataRetention.js");
          await runDataRetentionCleanup();
          return { ok: true };
        }
        case "scheduled.loyalty_expiry": {
          console.log("[queue] scheduled.loyalty_expiry", job.id);
          const { runLoyaltyExpirySweep } = await import("../services/loyaltyService.js");
          const result = await runLoyaltyExpirySweep();
          return { ok: true, ...result };
        }
        case "scheduled.order_advancement": {
          console.log("[queue] scheduled.order_advancement", job.id);
          const { runScheduledOrderAdvancementSweep } = await import(
            "../services/scheduledOrderService.js"
          );
          const result = await runScheduledOrderAdvancementSweep({
            limit:
              Number(job.data?.limit) || appConfig.scheduledOrderAdvancementLimit,
            restaurantId: job.data?.restaurantId || null,
            source: "queue",
          });
          return { ok: true, ...result };
        }
        case "ping":
          return { ok: true, at: new Date().toISOString() };
        case "notification.outbound":
          console.log(
            "[queue] notification.outbound",
            job.data?.notificationId || job.id
          );
          try {
            const notificationId = String(job.data?.notificationId || "");
            const userId = String(job.data?.userId || "");
            if (!notificationId || !userId) {
              return { ok: false, reason: "missing_notification_or_user" };
            }
            const [doc, user] = await Promise.all([
              notificationModel.findById(notificationId).lean(),
              userModel.findById(userId).select("email phone name pushDevices").lean(),
            ]);
            if (!doc) {
              return { ok: false, reason: "notification_not_found" };
            }
            if (!user) {
              return { ok: false, reason: "user_not_found" };
            }
            const rendered = renderNotificationTemplates(doc, user);
            const subject = rendered.subject;
            const plainBody = rendered.smsText;
            const html = rendered.emailHtml;
            const category = mapNotificationTypeToCategory(doc.type);
            const [emailEnabled, smsEnabled, pushEnabled] = await Promise.all([
              isChannelEnabled(userId, { category, channel: "email" }),
              isChannelEnabled(userId, { category, channel: "sms" }),
              isChannelEnabled(userId, { category, channel: "push" }),
            ]);

            const [emailOk, smsResp] = await Promise.all([
              user.email && emailEnabled
                ? sendHtmlEmail({ to: user.email, subject, html })
                : Promise.resolve(false),
              user.phone && smsEnabled
                ? sendSmsMessage({ toPhone: user.phone, message: `${subject}: ${plainBody}` })
                : Promise.resolve({ ok: false, reason: "disabled_or_missing_phone", provider: "none" }),
            ]);
            const pushTokens =
              pushEnabled && Array.isArray(user.pushDevices)
                ? user.pushDevices
                    .filter((d) => d?.active !== false && d?.token)
                    .map((d) => String(d.token))
                : [];
            const pushResp = await sendPushNotification({
              tokens: pushTokens,
              title: subject,
              body: plainBody,
              data: {
                notificationId: String(doc._id),
                type: String(doc.type || "system"),
                refType: String(doc.refType || ""),
                refId: String(doc.refId || ""),
              },
            });
            return {
              ok: true,
              channels: {
                email: emailOk ? "sent" : "skipped_or_failed",
                sms: smsResp.ok ? "sent" : `skipped_or_failed:${smsResp.reason || "unknown"}`,
                smsProvider: smsResp.provider || "none",
                push: pushResp.ok
                  ? `sent:${pushResp.sent}`
                  : `skipped_or_failed:${pushResp.reason || "unknown"}`,
                pushProvider: pushResp.provider || "none",
              },
            };
          } catch (err) {
            console.error("[queue] notification.outbound error", err?.message);
            return { ok: false, reason: "worker_exception", detail: err?.message || "" };
          }
        default:
          console.log("[queue] job", job.name, job.data);
          return { ok: true };
      }
    },
    { connection: workerConnection }
  );

  generalWorker.on("failed", (job, err) => {
    console.error("[queue] job failed", job?.name, err?.message);
  });

  console.log(`BullMQ worker listening on queue "${QUEUE_NAME}"`);
  return { queue: generalQueue, worker: generalWorker };
}

export function getGeneralQueue() {
  return generalQueue;
}

export async function getQueueRuntimeStats() {
  const base = {
    enabled: appConfig.enableJobQueue,
    active: !!generalQueue,
    workerActive: !!generalWorker,
    queueName: QUEUE_NAME,
  };
  if (!generalQueue) {
    return {
      ...base,
      counts: null,
    };
  }
  try {
    const counts = await generalQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );
    return {
      ...base,
      counts,
    };
  } catch (error) {
    return {
      ...base,
      counts: null,
      error: error?.message || "queue_stats_failed",
    };
  }
}

export async function stopJobQueue() {
  if (generalWorker) {
    await generalWorker.close();
    generalWorker = null;
  }
  if (generalQueue) {
    await generalQueue.close();
    generalQueue = null;
  }
  await closeBullmqConnections();
}
