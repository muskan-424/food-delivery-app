/**
 * Delivery radius checks (Phase 1). Coordinates use lat / lng in decimal degrees.
 */

const EARTH_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometers */
export function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    [lat1, lng1, lat2, lng2].some(
      (v) => v === undefined || v === null || Number.isNaN(Number(v))
    )
  ) {
    return null;
  }
  const a1 = toRad(Number(lat1));
  const a2 = toRad(Number(lat2));
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toPoint(p) {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/** Ray casting point-in-polygon (expects array of {lat,lng}) */
export function isPointInPolygon(lat, lng, polygon) {
  const p = toPoint({ lat, lng });
  if (!p || !Array.isArray(polygon) || polygon.length < 3) return null;
  const pts = polygon.map(toPoint).filter(Boolean);
  if (pts.length < 3) return null;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng;
    const yi = pts[i].lat;
    const xj = pts[j].lng;
    const yj = pts[j].lat;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * @returns {boolean|null} true/false if check applies; null if skipped (no radius or coords)
 */
export function isWithinDeliveryRadius(restaurant, customerLat, customerLng) {
  if (customerLat == null || customerLng == null) return null;

  const zones = Array.isArray(restaurant?.deliveryZones)
    ? restaurant.deliveryZones.filter((z) => z?.isActive !== false)
    : [];
  if (zones.length > 0) {
    let validPolygonFound = false;
    for (const zone of zones) {
      const inPoly = isPointInPolygon(customerLat, customerLng, zone?.polygon || []);
      if (inPoly === true) return true;
      if (inPoly !== null) validPolygonFound = true;
    }
    if (validPolygonFound) return false;
  }

  const r = restaurant?.deliveryRadiusKm;
  if (r == null || r <= 0) return null;

  const rLat = restaurant?.address?.coordinates?.lat;
  const rLng = restaurant?.address?.coordinates?.lng;
  if (rLat == null || rLng == null) return null;

  const d = haversineKm(rLat, rLng, customerLat, customerLng);
  if (d == null) return null;
  return d <= r;
}

/** Rough road time from straight-line distance (Phase 5 ETA helper). */
export function estimateTravelMinutes(distanceKm, avgSpeedKmh = 22) {
  if (distanceKm == null || Number.isNaN(Number(distanceKm)) || distanceKm <= 0) {
    return null;
  }
  const speed = Math.max(5, Number(avgSpeedKmh) || 22);
  const base = (Number(distanceKm) / speed) * 60;
  const withBuffer = base * 1.15 + 5;
  return Math.max(5, Math.round(withBuffer));
}
