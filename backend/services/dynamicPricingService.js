/**
 * Light dynamic pricing (Phase 7): optional Redis override + time-based rules (JSON in Redis or env).
 * Rules are cached briefly to limit Redis reads.
 */

import { getRedisClient, isRedisEnabled } from "../config/redis.js";
import { appConfig } from "../config/appConfig.js";

const REDIS_OVERRIDE = "dynamic_pricing:override";
const REDIS_RULES = "dynamic_pricing:rules";

const WEEKDAY_SHORT = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

let rulesCache = { key: "", parsed: [], expiresAt: 0 };
let memoryOverride = null;
let memoryRules = [];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function getLocalWeekdayAndMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const wd = WEEKDAY_SHORT[map.weekday];
  const hour = Number(map.hour) || 0;
  const minute = Number(map.minute) || 0;
  if (wd === undefined) {
    return { weekday: date.getUTCDay(), minutes: date.getUTCHours() * 60 + date.getUTCMinutes() };
  }
  return { weekday: wd, minutes: hour * 60 + minute };
}

function minutesInWindow(mins, startHour, endHour) {
  const start = Math.max(0, Math.min(24, Number(startHour) || 0)) * 60;
  const end = Math.max(0, Math.min(24, Number(endHour) || 24)) * 60;
  if (start === end) return false;
  if (start < end) {
    return mins >= start && mins < end;
  }
  return mins >= start || mins < end;
}

function ruleMatches(rule, restaurantId, weekday, minutes) {
  const mult = Number(rule.multiplier);
  if (!Number.isFinite(mult) || mult <= 0) return null;

  const rids = rule.restaurantIds;
  if (Array.isArray(rids) && rids.length > 0) {
    if (!restaurantId || !rids.some((id) => String(id) === String(restaurantId))) {
      return null;
    }
  }

  const days = rule.days;
  if (Array.isArray(days) && days.length > 0) {
    if (!days.includes(weekday)) return null;
  }

  const sh = rule.startHour ?? 0;
  const eh = rule.endHour ?? 24;
  if (!minutesInWindow(minutes, sh, eh)) return null;

  return {
    multiplier: mult,
    ruleId: String(rule.id || rule.label || "rule"),
    label: String(rule.label || rule.id || "Dynamic pricing"),
  };
}

async function loadRulesJson() {
  const now = Date.now();
  let key = "";

  if (isRedisEnabled()) {
    try {
      const r = await getRedisClient().get(REDIS_RULES);
      if (r) {
        key = `redis:${r}`;
        if (rulesCache.key === key && rulesCache.expiresAt > now) {
          return rulesCache.parsed;
        }
        const parsed = JSON.parse(r);
        const arr = Array.isArray(parsed) ? parsed : [];
        rulesCache = { key, parsed: arr, expiresAt: now + 60_000 };
        return arr;
      }
    } catch (e) {
      console.error("dynamicPricing rules Redis:", e.message);
    }
  }

  if (Array.isArray(memoryRules) && memoryRules.length > 0) {
    const keyMem = `memory:${JSON.stringify(memoryRules)}`;
    if (rulesCache.key === keyMem && rulesCache.expiresAt > now) {
      return rulesCache.parsed;
    }
    rulesCache = { key: keyMem, parsed: memoryRules, expiresAt: now + 60_000 };
    return memoryRules;
  }

  const env = process.env.DYNAMIC_PRICING_RULES?.trim();
  key = `env:${env || ""}`;
  if (rulesCache.key === key && rulesCache.expiresAt > now) {
    return rulesCache.parsed;
  }
  if (!env) {
    rulesCache = { key, parsed: [], expiresAt: now + 60_000 };
    return [];
  }
  try {
    const parsed = JSON.parse(env);
    const arr = Array.isArray(parsed) ? parsed : [];
    rulesCache = { key, parsed: arr, expiresAt: now + 60_000 };
    return arr;
  } catch {
    rulesCache = { key, parsed: [], expiresAt: now + 60_000 };
    return [];
  }
}

async function readRedisOverride() {
  if (!isRedisEnabled()) return null;
  try {
    const v = await getRedisClient().get(REDIS_OVERRIDE);
    if (v == null || v === "") return null;
    const n = Number(String(v).trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return round2(n);
  } catch {
    return null;
  }
}

function normalizeRulesInput(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule, idx) => {
      const multiplier = Number(rule?.multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
      const startHour = Number(rule?.startHour ?? 0);
      const endHour = Number(rule?.endHour ?? 24);
      const days = Array.isArray(rule?.days)
        ? rule.days
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : [];
      const restaurantIds = Array.isArray(rule?.restaurantIds)
        ? rule.restaurantIds
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        : [];
      return {
        id: String(rule?.id || `rule_${idx + 1}`),
        label: String(rule?.label || `Rule ${idx + 1}`),
        multiplier: round2(multiplier),
        startHour: Math.max(0, Math.min(24, Number.isFinite(startHour) ? startHour : 0)),
        endHour: Math.max(0, Math.min(24, Number.isFinite(endHour) ? endHour : 24)),
        days: Array.from(new Set(days)),
        restaurantIds: Array.from(new Set(restaurantIds)),
      };
    })
    .filter(Boolean)
    .slice(0, 200);
}

export async function getDynamicPricingAdminState() {
  const override = await readRedisOverride();
  const rules = await loadRulesJson();
  return {
    enabled: appConfig.enableDynamicPricing,
    timezone: process.env.DYNAMIC_PRICING_TIMEZONE?.trim() || "Asia/Kolkata",
    overrideMultiplier: override != null ? override : memoryOverride,
    rules,
    source: isRedisEnabled() ? "redis_or_env" : "memory_or_env",
  };
}

export async function setDynamicPricingOverride(multiplier) {
  const numeric = Number(multiplier);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("override multiplier must be > 0");
  }
  const rounded = round2(numeric);
  if (isRedisEnabled()) {
    await getRedisClient().set(REDIS_OVERRIDE, String(rounded));
  } else {
    memoryOverride = rounded;
  }
  return rounded;
}

export async function clearDynamicPricingOverride() {
  if (isRedisEnabled()) {
    await getRedisClient().del(REDIS_OVERRIDE);
  }
  memoryOverride = null;
  return true;
}

export async function setDynamicPricingRules(rules) {
  const normalized = normalizeRulesInput(rules);
  if (isRedisEnabled()) {
    await getRedisClient().set(REDIS_RULES, JSON.stringify(normalized));
  } else {
    memoryRules = normalized;
  }
  rulesCache = { key: "", parsed: [], expiresAt: 0 };
  return normalized;
}

/**
 * @param {{ restaurantId?: string|null, at?: Date }} opts
 * @returns {Promise<{ multiplier: number, ruleId: string, label: string, source: string }>}
 */
export async function getDynamicPricingMultiplier(opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const restaurantId = opts.restaurantId ? String(opts.restaurantId) : null;

  if (!appConfig.enableDynamicPricing) {
    return {
      multiplier: 1,
      ruleId: "",
      label: "",
      source: "disabled",
    };
  }

  const override = await readRedisOverride();
  if (override != null) {
    return {
      multiplier: override,
      ruleId: "redis_override",
      label: "Live multiplier (Redis)",
      source: "redis_override",
    };
  }

  const tz =
    process.env.DYNAMIC_PRICING_TIMEZONE?.trim() || "Asia/Kolkata";
  const { weekday, minutes } = getLocalWeekdayAndMinutes(at, tz);

  const rules = await loadRulesJson();
  let best = null;
  for (const rule of rules) {
    const m = ruleMatches(rule, restaurantId, weekday, minutes);
    if (!m) continue;
    if (!best || m.multiplier > best.multiplier) {
      best = { ...m, source: "rule" };
    }
  }

  if (best) {
    return {
      multiplier: round2(best.multiplier),
      ruleId: best.ruleId,
      label: best.label,
      source: "rule",
    };
  }

  return { multiplier: 1, ruleId: "", label: "", source: "none" };
}
