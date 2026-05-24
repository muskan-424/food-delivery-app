import { haversineKm, estimateTravelMinutes } from "../utils/geoUtils.js";
import { appConfig } from "../config/appConfig.js";

const etaCache = new Map();

function roundCoord(v) {
  return Math.round(Number(v) * 10000) / 10000;
}

function cacheKey(rLat, rLng, cLat, cLng, provider) {
  return `${provider}|${roundCoord(rLat)},${roundCoord(rLng)}|${roundCoord(cLat)},${roundCoord(cLng)}`;
}

function readCache(key) {
  const row = etaCache.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    etaCache.delete(key);
    return null;
  }
  return row.value;
}

function writeCache(key, value) {
  etaCache.set(key, {
    value,
    expiresAt: Date.now() + appConfig.deliveryEtaCacheTtlMs,
  });
}

async function fetchGoogleDistanceEta(rLat, rLng, cLat, cLng) {
  const key = appConfig.deliveryEtaGoogleApiKey;
  if (!key) return null;
  const origins = `${rLat},${rLng}`;
  const destinations = `${cLat},${cLng}`;
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json" +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    "&mode=driving" +
    `&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const body = await resp.json();
  const element = body?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;
  const distanceMeters = Number(element?.distance?.value);
  const durationSeconds = Number(element?.duration?.value);
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null;
  const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
  const estimatedMinutes = Math.max(1, Math.round(durationSeconds / 60));
  return {
    distanceKm,
    estimatedMinutes,
    source: "google_distance_matrix",
  };
}

/**
 * ETA from restaurant to customer using coordinates (Phase 5).
 * Falls back to null fields if coordinates are missing.
 */
export async function buildDeliveryEtaSnapshot(order, restaurant) {
  const rLat = restaurant?.address?.coordinates?.lat;
  const rLng = restaurant?.address?.coordinates?.lng;
  const cLat = order?.address?.coordinates?.lat;
  const cLng = order?.address?.coordinates?.lng;

  const hasCoords = [rLat, rLng, cLat, cLng].every((v) => Number.isFinite(Number(v)));
  let distanceKm = null;
  let estimatedMinutes = null;
  let source = "unknown";

  if (hasCoords) {
    const provider = appConfig.deliveryEtaProvider;
    const key = cacheKey(rLat, rLng, cLat, cLng, provider);
    const cached = readCache(key);
    if (cached) {
      distanceKm = cached.distanceKm;
      estimatedMinutes = cached.estimatedMinutes;
      source = `${cached.source}_cache`;
    } else {
      let providerEta = null;
      if (provider === "google") {
        try {
          providerEta = await fetchGoogleDistanceEta(rLat, rLng, cLat, cLng);
        } catch {
          providerEta = null;
        }
      }
      if (providerEta) {
        distanceKm = providerEta.distanceKm;
        estimatedMinutes = providerEta.estimatedMinutes;
        source = providerEta.source;
      } else {
        const straightKm = haversineKm(rLat, rLng, cLat, cLng);
        distanceKm = straightKm != null ? Math.round(straightKm * 100) / 100 : null;
        estimatedMinutes = estimateTravelMinutes(distanceKm);
        source = distanceKm != null ? "haversine" : "unknown";
      }
      if (distanceKm != null && estimatedMinutes != null) {
        writeCache(key, { distanceKm, estimatedMinutes, source });
      }
    }
  }

  const computedAt = new Date();
  let etaAt = null;
  if (estimatedMinutes != null) {
    etaAt = new Date(computedAt.getTime() + estimatedMinutes * 60 * 1000);
  }

  return {
    etaAt,
    distanceKm,
    estimatedMinutes,
    source,
    computedAt,
  };
}
