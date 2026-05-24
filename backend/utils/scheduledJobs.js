/**
 * Scheduled jobs are now queue-backed (BullMQ repeatable jobs).
 */
import { appConfig } from "../config/appConfig.js";

export const scheduleDataRetention = async (queue) => {
  if (process.env.ENABLE_SCHEDULED_JOBS !== "true") return;
  if (!queue) {
    console.warn("Scheduled jobs enabled but queue is unavailable; skipping data retention schedule.");
    return;
  }
  await queue.add(
    "scheduled.data_retention",
    {},
    {
      repeat: { pattern: "0 2 * * *" },
      jobId: "scheduled.data_retention.daily",
      removeOnComplete: 20,
      removeOnFail: 20,
    }
  );
  console.log("Data retention cleanup scheduled via queue (daily at 2 AM)");
};

export const scheduleLoyaltyExpiry = async (queue) => {
  if (process.env.ENABLE_SCHEDULED_JOBS !== "true") return;
  const days = Number(process.env.LOYALTY_EXPIRY_DAYS);
  if (!Number.isFinite(days) || days <= 0) return;
  if (!queue) {
    console.warn("Scheduled jobs enabled but queue is unavailable; skipping loyalty expiry schedule.");
    return;
  }
  await queue.add(
    "scheduled.loyalty_expiry",
    {},
    {
      repeat: { pattern: "30 2 * * *" },
      jobId: "scheduled.loyalty_expiry.daily",
      removeOnComplete: 20,
      removeOnFail: 20,
    }
  );
  console.log("Loyalty expiry sweep scheduled via queue (daily at 2:30 AM)");
};

export const scheduleOrderAdvancement = async (queue) => {
  if (process.env.ENABLE_SCHEDULED_JOBS !== "true") return;
  if (!queue) {
    console.warn("Scheduled jobs enabled but queue is unavailable; skipping scheduled order advancement.");
    return;
  }
  await queue.add(
    "scheduled.order_advancement",
    { limit: appConfig.scheduledOrderAdvancementLimit },
    {
      repeat: { every: appConfig.scheduledOrderAdvancementEveryMs },
      jobId: "scheduled.order_advancement.repeat",
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
  console.log(
    `Scheduled order advancement queued every ${appConfig.scheduledOrderAdvancementEveryMs}ms (limit=${appConfig.scheduledOrderAdvancementLimit})`
  );
};

export const initializeScheduledJobs = async (queue) => {
  await scheduleDataRetention(queue);
  await scheduleLoyaltyExpiry(queue);
  await scheduleOrderAdvancement(queue);
};

