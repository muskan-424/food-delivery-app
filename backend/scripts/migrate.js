#!/usr/bin/env node
/**
 * Lightweight MongoDB migration runner (Phase W).
 * Usage:
 *   node scripts/migrate.js up
 *   node scripts/migrate.js down
 *   node scripts/migrate.js status
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";
import migrationStateModel from "../models/migrationStateModel.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function loadMigrationFiles() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();
  const loaded = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    const id = mod.id || file.replace(/\.js$/, "");
    loaded.push({
      id,
      file,
      description: mod.description || "",
      up: mod.up,
      down: mod.down,
    });
  }
  return loaded;
}

async function connect() {
  const url = process.env.MONGO_URL;
  if (!url) {
    console.error("MONGO_URL is required");
    process.exit(1);
  }
  await mongoose.connect(url);
  return mongoose.connection.db;
}

async function cmdStatus() {
  const db = await connect();
  const all = await loadMigrationFiles();
  const applied = await migrationStateModel.find().sort({ name: 1 }).lean();
  const appliedSet = new Set(applied.map((r) => r.name));
  console.log("\nMigration status\n================");
  for (const m of all) {
    console.log(`${appliedSet.has(m.id) ? "✅" : "⬜"} ${m.id} — ${m.description}`);
  }
  console.log(`\n${applied.length}/${all.length} applied\n`);
  await mongoose.disconnect();
}

async function cmdUp() {
  const db = await connect();
  const all = await loadMigrationFiles();
  let ran = 0;
  for (const m of all) {
    const exists = await migrationStateModel.findOne({ name: m.id });
    if (exists) continue;
    if (typeof m.up !== "function") {
      console.error(`Migration ${m.id} has no up()`);
      process.exit(1);
    }
    console.log(`▶ Applying ${m.id}...`);
    await m.up(db);
    await migrationStateModel.create({ name: m.id, checksum: m.file });
    console.log(`✅ Applied ${m.id}`);
    ran += 1;
  }
  if (!ran) console.log("No pending migrations.");
  await mongoose.disconnect();
}

async function cmdDown() {
  const db = await connect();
  const last = await migrationStateModel.findOne().sort({ appliedAt: -1 });
  if (!last) {
    console.log("No migrations to roll back.");
    await mongoose.disconnect();
    return;
  }
  const all = await loadMigrationFiles();
  const m = all.find((x) => x.id === last.name);
  if (!m || typeof m.down !== "function") {
    console.error(`Cannot roll back ${last.name}: migration file or down() missing`);
    process.exit(1);
  }
  console.log(`◀ Rolling back ${m.id}...`);
  await m.down(db);
  await migrationStateModel.deleteOne({ _id: last._id });
  console.log(`✅ Rolled back ${m.id}`);
  await mongoose.disconnect();
}

const cmd = process.argv[2] || "status";
try {
  if (cmd === "up") await cmdUp();
  else if (cmd === "down") await cmdDown();
  else if (cmd === "status") await cmdStatus();
  else {
    console.error("Usage: node scripts/migrate.js [up|down|status]");
    process.exit(1);
  }
} catch (err) {
  console.error("Migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
