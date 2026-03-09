import { connectDB } from "../config/db.js";
import { runDataRetentionCleanup } from "../utils/dataRetention.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * Data Retention Cleanup Job
 * Run this script periodically (e.g., daily via cron) to clean up old data
 */
const runCleanup = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    
    console.log('Running data retention cleanup...');
    const results = await runDataRetentionCleanup();
    
    console.log('Cleanup completed:', results);
    process.exit(0);
  } catch (error) {
    console.error('Error running cleanup:', error);
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup();
}

export default runCleanup;

