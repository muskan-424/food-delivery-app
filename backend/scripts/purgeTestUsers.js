#!/usr/bin/env node

/**
 * Remove test/smoke accounts and related data from MongoDB.
 *
 * Usage:
 *   node scripts/purgeTestUsers.js           # dry-run (list only)
 *   node scripts/purgeTestUsers.js --execute # delete
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const TEST_EMAIL_PATTERNS = [
  /@test\.local$/i,
  /^testuser@example\.com$/i,
  /^john\.doe\.tester@example\.com$/i,
];

function isTestEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return TEST_EMAIL_PATTERNS.some((re) => re.test(normalized));
}

async function deleteByUserIds(db, collection, field, userIds, idAsString = false) {
  if (userIds.length === 0) return 0;
  const values = idAsString ? userIds.map(String) : userIds;
  const result = await db.collection(collection).deleteMany({ [field]: { $in: values } });
  return result.deletedCount || 0;
}

async function main() {
  const execute = process.argv.includes("--execute");

  if (!process.env.MONGO_URL) {
    console.error("❌ MONGO_URL is not set in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;

  const allUsers = await db.collection("users").find({}).toArray();
  const testUsers = allUsers.filter((u) => isTestEmail(u.email));
  const keepUsers = allUsers.filter((u) => !isTestEmail(u.email));

  if (testUsers.length === 0) {
    console.log("✅ No test accounts found.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${testUsers.length} test account(s) to remove:\n`);
  for (const u of testUsers) {
    console.log(`  • ${u.email} (${u.name || "—"}, ${u.role || "user"})`);
  }

  console.log(`\nKeeping ${keepUsers.length} account(s):`);
  for (const u of keepUsers) {
    console.log(`  • ${u.email}`);
  }

  if (!execute) {
    console.log("\nDry-run only. Re-run with --execute to delete.");
    await mongoose.disconnect();
    process.exit(0);
  }

  const userIds = testUsers.map((u) => u._id);
  const userIdStrings = userIds.map(String);
  const summary = {};

  const objectIdCollections = [
    ["refreshtokens", "userId"],
    ["csrftokens", "userId"],
    ["useractivities", "userId"],
    ["passwordresettokens", "userId"],
    ["tokenblacklists", "userId"],
    ["idempotencies", "userId"],
  ];

  const stringIdCollections = [
    ["orders", "userId"],
    ["payments", "userId"],
    ["disputes", "userId"],
    ["notifications", "userId"],
    ["walletledgerentries", "userId"],
    ["groupsplitpayments", "userId"],
    ["analyticsevents", "userId"],
  ];

  for (const [col, field] of objectIdCollections) {
    summary[col] = await deleteByUserIds(db, col, field, userIds, false);
  }
  for (const [col, field] of stringIdCollections) {
    summary[col] = await deleteByUserIds(db, col, field, userIdStrings, true);
  }

  // Reviews reference user ObjectId
  summary.reviews = await deleteByUserIds(db, "reviews", "userId", userIds, false);
  summary.supporttickets = await deleteByUserIds(db, "supporttickets", "userId", userIds, false);

  const usersResult = await db.collection("users").deleteMany({ _id: { $in: userIds } });
  summary.users = usersResult.deletedCount || 0;

  console.log("\n✅ Cleanup complete:\n");
  for (const [col, count] of Object.entries(summary)) {
    if (count > 0) console.log(`  ${col}: ${count} deleted`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Error:", err.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
