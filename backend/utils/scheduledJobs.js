import cron from "node-cron";

/**
 * Scheduled Jobs for Data Retention and Cleanup
 * Runs automated cleanup tasks
 */

// Run data retention cleanup daily at 2 AM
export const scheduleDataRetention = () => {
  if (process.env.ENABLE_SCHEDULED_JOBS !== 'true') {
    console.log('Scheduled jobs disabled');
    return;
  }

  // Daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled data retention cleanup...');
    try {
      const { runDataRetentionCleanup } = await import("./dataRetention.js");
      await runDataRetentionCleanup();
      console.log('Scheduled cleanup completed');
    } catch (error) {
      console.error('Error in scheduled cleanup:', error);
    }
  });

  console.log('Data retention cleanup scheduled (daily at 2 AM)');
};

// Initialize scheduled jobs
export const initializeScheduledJobs = () => {
  scheduleDataRetention();
};

