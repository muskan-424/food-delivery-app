import fs from "fs/promises";
import path from "path";
import analyticsEventModel from "../models/analyticsEventModel.js";

const EXPORT_DIR = path.resolve(process.cwd(), "exports", "analytics");
const MAX_EXPORT_ROWS = 50000;

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

function pickStatusCodeFilter(statusClass, statusCodeRaw) {
  const statusCode = Number(statusCodeRaw);
  if (Number.isFinite(statusCode) && statusCode >= 100 && statusCode <= 599) {
    return Math.floor(statusCode);
  }
  const cls = String(statusClass || "").trim().toLowerCase();
  if (cls === "4xx") return { $gte: 400, $lt: 500 };
  if (cls === "5xx") return { $gte: 500, $lt: 600 };
  return null;
}

export function buildAnalyticsEventQuery(filters = {}) {
  const q = {};
  const eventType = String(filters.eventType || "").trim();
  const method = String(filters.method || "").trim().toUpperCase();
  const pathFilter = String(filters.path || "").trim().slice(0, 200);
  if (eventType) q.eventType = eventType;
  if (method) q.method = method;
  if (pathFilter) q.path = { $regex: pathFilter, $options: "i" };
  const statusFilter = pickStatusCodeFilter(filters.statusClass, filters.statusCode);
  if (statusFilter != null) q.statusCode = statusFilter;

  const fromRaw = String(filters.from || "").trim();
  const toRaw = String(filters.to || "").trim();
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if (fromRaw && (!from || Number.isNaN(from.getTime()))) {
    throw new Error("Invalid from date");
  }
  if (toRaw && (!to || Number.isNaN(to.getTime()))) {
    throw new Error("Invalid to date");
  }
  if (from && to && from > to) {
    throw new Error("from must be <= to");
  }
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = from;
    if (to) q.createdAt.$lte = to;
  }
  return q;
}

export async function exportAnalyticsEventsToFile({ format = "jsonl", filters = {} }) {
  const safeFormat = format === "csv" ? "csv" : "jsonl";
  const query = buildAnalyticsEventQuery(filters);
  const rows = await analyticsEventModel
    .find(query)
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean();

  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `analytics-events-${ts}.${safeFormat}`;
  const filePath = path.join(EXPORT_DIR, fileName);

  if (safeFormat === "jsonl") {
    const lines = rows.map((row) => JSON.stringify(row)).join("\n");
    await fs.writeFile(filePath, lines ? `${lines}\n` : "", "utf8");
  } else {
    const header = [
      "_id",
      "createdAt",
      "eventType",
      "requestId",
      "userId",
      "role",
      "method",
      "path",
      "statusCode",
      "durationMs",
      "meta",
    ];
    const bodyLines = rows.map((row) =>
      [
        row._id,
        row.createdAt,
        row.eventType,
        row.requestId,
        row.userId,
        row.role,
        row.method,
        row.path,
        row.statusCode,
        row.durationMs,
        row.meta ? JSON.stringify(row.meta) : "",
      ]
        .map(escapeCsvCell)
        .join(",")
    );
    const csv = [header.join(","), ...bodyLines].join("\n");
    await fs.writeFile(filePath, `${csv}\n`, "utf8");
  }

  const st = await fs.stat(filePath);
  return {
    fileName,
    filePath,
    rowCount: rows.length,
    bytes: Number(st.size || 0),
    truncated: rows.length >= MAX_EXPORT_ROWS,
    maxRows: MAX_EXPORT_ROWS,
  };
}

export function isExportPathAllowed(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  return resolved.startsWith(EXPORT_DIR);
}

