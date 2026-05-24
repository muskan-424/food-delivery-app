/**
 * Operating hours + exceptions (Phase 1).
 * Uses server local timezone. Prefer weeklyHours; falls back to isOpen legacy flag.
 */

function parseHHMM(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesNow(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function sameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function inOpenCloseRange(nowMinutes, openStr, closeStr) {
  const o = parseHHMM(openStr);
  const c = parseHHMM(closeStr);
  if (o == null || c == null) return true;
  const n = nowMinutes;
  if (c >= o) return n >= o && n <= c;
  // overnight
  return n >= o || n <= c;
}

/**
 * @returns {{ open: boolean, reason: string }}
 */
export function isRestaurantOpenNow(restaurant, now = new Date()) {
  if (!restaurant?.isActive) {
    return { open: false, reason: "inactive" };
  }

  const exceptions = restaurant.hourExceptions || [];
  for (const ex of exceptions) {
    if (!ex?.date) continue;
    const d = new Date(ex.date);
    if (!sameCalendarDay(d, now)) continue;
    if (ex.closed) {
      return { open: false, reason: "exception_closed" };
    }
    if (ex.open && ex.close) {
      const ok = inOpenCloseRange(minutesNow(now), ex.open, ex.close);
      return { open: ok, reason: ok ? "exception_hours" : "outside_exception_hours" };
    }
    break;
  }

  const weekly = restaurant.weeklyHours || [];
  if (weekly.length > 0) {
    const dow = now.getDay();
    const slot = weekly.find((h) => Number(h.dayOfWeek) === dow);
    if (!slot || slot.closed) {
      return { open: false, reason: "closed_today" };
    }
    const ok = inOpenCloseRange(minutesNow(now), slot.open, slot.close);
    return { open: ok, reason: ok ? "weekly_hours" : "outside_weekly_hours" };
  }

  if (restaurant.isOpen === false) {
    return { open: false, reason: "legacy_closed" };
  }
  return { open: true, reason: "legacy_open" };
}

/**
 * Same rules as {@link isRestaurantOpenNow} but for a specific instant (e.g. scheduled order slot).
 * @param {*} restaurant — restaurant document or plain object with hours fields
 * @param {Date} at
 * @returns {{ open: boolean, reason: string }}
 */
export function isRestaurantOpenAt(restaurant, at = new Date()) {
  if (!restaurant?.isActive) {
    return { open: false, reason: "inactive" };
  }

  const exceptions = restaurant.hourExceptions || [];
  for (const ex of exceptions) {
    if (!ex?.date) continue;
    const d = new Date(ex.date);
    if (!sameCalendarDay(d, at)) continue;
    if (ex.closed) {
      return { open: false, reason: "exception_closed" };
    }
    if (ex.open && ex.close) {
      const ok = inOpenCloseRange(minutesAt(at), ex.open, ex.close);
      return { open: ok, reason: ok ? "exception_hours" : "outside_exception_hours" };
    }
    break;
  }

  const weekly = restaurant.weeklyHours || [];
  if (weekly.length > 0) {
    const dow = at.getDay();
    const slot = weekly.find((h) => Number(h.dayOfWeek) === dow);
    if (!slot || slot.closed) {
      return { open: false, reason: "closed_today" };
    }
    const ok = inOpenCloseRange(minutesNow(at), slot.open, slot.close);
    return { open: ok, reason: ok ? "weekly_hours" : "outside_weekly_hours" };
  }

  if (restaurant.isOpen === false) {
    return { open: false, reason: "legacy_closed" };
  }
  return { open: true, reason: "legacy_open" };
}
