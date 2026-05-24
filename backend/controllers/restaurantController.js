import restaurantModel from "../models/restaurantModel.js";
import { appConfig } from "../config/appConfig.js";
import { publicRestaurantMatchForKycGate } from "../utils/restaurantKycUtils.js";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { isPointInPolygon, isWithinDeliveryRadius, haversineKm } from "../utils/geoUtils.js";
import { createSignedPutUrl, getMediaPublicUrl } from "../utils/mediaStorage.js";
import { normalizeUploadedMediaKey } from "../utils/mediaKeyValidation.js";

function normalizeDeliveryZones(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((zone, idx) => {
      const rawPoly = Array.isArray(zone?.polygon) ? zone.polygon : [];
      const polygon = rawPoly
        .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
        .filter(
          (p) =>
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) &&
            p.lat >= -90 &&
            p.lat <= 90 &&
            p.lng >= -180 &&
            p.lng <= 180
        );
      if (polygon.length < 3) return null;
      const first = polygon[0];
      const last = polygon[polygon.length - 1];
      if (first.lat !== last.lat || first.lng !== last.lng) {
        polygon.push({ lat: first.lat, lng: first.lng });
      }
      return {
        id: String(zone?.id || `zone-${idx + 1}`).slice(0, 64),
        name: String(zone?.name || "").slice(0, 120),
        isActive: zone?.isActive !== false,
        polygon,
      };
    })
    .filter(Boolean);
}

function toBoundedNumber(raw, { min = 0, max = Number.POSITIVE_INFINITY, fallback = 0 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeRestaurantEconomicsInput(input, { partial = false } = {}) {
  const out = {};

  if (!partial || Object.prototype.hasOwnProperty.call(input, "commissionPercent")) {
    out.commissionPercent = toBoundedNumber(input.commissionPercent, {
      min: 0,
      max: 100,
      fallback: 0,
    });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, "defaultTaxRatePercent")) {
    out.defaultTaxRatePercent = toBoundedNumber(input.defaultTaxRatePercent, {
      min: 0,
      max: 100,
      fallback: 0,
    });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, "minimumPayoutAmount")) {
    out.minimumPayoutAmount = toBoundedNumber(input.minimumPayoutAmount, {
      min: 0,
      fallback: 0,
    });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, "deliveryRadiusKm")) {
    if (
      input.deliveryRadiusKm === "" ||
      input.deliveryRadiusKm === null ||
      input.deliveryRadiusKm === undefined
    ) {
      out.deliveryRadiusKm = null;
    } else {
      const r = Number(input.deliveryRadiusKm);
      out.deliveryRadiusKm = Number.isFinite(r) ? r : null;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, "menuPricesIncludeTax")) {
    out.menuPricesIncludeTax =
      input.menuPricesIncludeTax === true || input.menuPricesIncludeTax === "true";
  }

  if (
    Object.prototype.hasOwnProperty.call(out, "menuPricesIncludeTax") &&
    out.menuPricesIncludeTax &&
    Object.prototype.hasOwnProperty.call(out, "defaultTaxRatePercent") &&
    out.defaultTaxRatePercent <= 0
  ) {
    out.menuPricesIncludeTax = false;
  }

  return out;
}

// Get all restaurants (public: KYC-approved only when REQUIRE_RESTAURANT_KYC_FOR_ORDERS=true)
const getRestaurants = async (req, res) => {
  try {
    const { isActive, cuisine } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (cuisine) {
      query.cuisine = cuisine;
    }

    Object.assign(query, publicRestaurantMatchForKycGate());

    const [restaurants, total] = await Promise.all([
      restaurantModel.find(query).sort({ rating: -1 }).skip(skip).limit(limit),
      restaurantModel.countDocuments(query),
    ]);
    
    sendSuccess(res, req, 200, {
      success: true,
      data: restaurants,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching restaurants");
  }
};

// Search restaurants (Phase 9 baseline)
const searchRestaurants = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (!q || q.length < 2) {
      return sendError(res, req, 400, "q must be at least 2 characters");
    }
    const { page, limit, skip } = getPaginationParams(req.query);
    const onlyOpen = String(req.query.onlyOpen || "").trim().toLowerCase() === "true";
    const onlyActive = String(req.query.onlyActive || "true").trim().toLowerCase() !== "false";

    const textRegex = { $regex: q, $options: "i" };
    const query = {
      $or: [
        { name: textRegex },
        { cuisine: textRegex },
        { description: textRegex },
        { "address.city": textRegex },
        { "address.state": textRegex },
      ],
    };
    if (onlyActive) query.isActive = true;
    if (onlyOpen) query.isOpen = true;
    Object.assign(query, publicRestaurantMatchForKycGate());

    const [rows, total] = await Promise.all([
      restaurantModel
        .find(query)
        .sort({ rating: -1, totalRatings: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      restaurantModel.countDocuments(query),
    ]);

    return sendSuccess(res, req, 200, {
      success: true,
      data: rows,
      pagination: buildPaginationMeta(total, page, limit),
      query: { q, onlyOpen, onlyActive },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error searching restaurants");
  }
};

/** Admin: all restaurants including pending KYC (no public gate) */
const getRestaurantsAdmin = async (req, res) => {
  try {
    const { isActive, cuisine } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (cuisine) {
      query.cuisine = cuisine;
    }

    const [restaurants, total] = await Promise.all([
      restaurantModel.find(query).sort({ rating: -1 }).skip(skip).limit(limit),
      restaurantModel.countDocuments(query),
    ]);

    sendSuccess(res, req, 200, {
      success: true,
      data: restaurants,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching restaurants");
  }
};

/** Admin: KYC review queue with filters and summary counts */
const getRestaurantKycQueue = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const status = String(req.query.status || "").trim().toLowerCase();
    const q = String(req.query.q || "").trim().slice(0, 120);
    const submittedBeforeRaw = String(req.query.submittedBefore || "").trim();
    const submittedAfterRaw = String(req.query.submittedAfter || "").trim();
    const includeApproved = String(req.query.includeApproved || "").trim().toLowerCase() === "true";
    const now = new Date();
    const allowedStatuses = ["pending", "submitted", "approved", "rejected"];

    if (status && !allowedStatuses.includes(status)) {
      return sendError(res, req, 400, "Invalid status filter");
    }

    const query = {};
    if (allowedStatuses.includes(status)) {
      query.kycStatus = status;
    } else if (!includeApproved) {
      query.kycStatus = { $in: ["pending", "submitted", "rejected"] };
    }

    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { cuisine: { $regex: q, $options: "i" } },
        { "address.city": { $regex: q, $options: "i" } },
        { "address.state": { $regex: q, $options: "i" } },
      ];
    }

    const submittedAt = {};
    const submittedBefore = submittedBeforeRaw ? new Date(submittedBeforeRaw) : null;
    const submittedAfter = submittedAfterRaw ? new Date(submittedAfterRaw) : null;
    if (submittedBeforeRaw && (!submittedBefore || Number.isNaN(submittedBefore.getTime()))) {
      return sendError(res, req, 400, "Invalid submittedBefore date");
    }
    if (submittedAfterRaw && (!submittedAfter || Number.isNaN(submittedAfter.getTime()))) {
      return sendError(res, req, 400, "Invalid submittedAfter date");
    }
    if (submittedBefore && submittedAfter && submittedAfter > submittedBefore) {
      return sendError(res, req, 400, "submittedAfter must be <= submittedBefore");
    }
    if (submittedBefore && !Number.isNaN(submittedBefore.getTime())) {
      submittedAt.$lte = submittedBefore;
    }
    if (submittedAfter && !Number.isNaN(submittedAfter.getTime())) {
      submittedAt.$gte = submittedAfter;
    }
    if (Object.keys(submittedAt).length > 0) {
      query.kycSubmittedAt = submittedAt;
    }

    const [rows, total, byStatus] = await Promise.all([
      restaurantModel
        .find(query)
        .select(
          "name cuisine isActive kycStatus kycSubmittedAt kycReviewedAt kycReviewNote kycDocumentUrl address.city address.state updatedAt createdAt"
        )
        .sort({ kycSubmittedAt: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      restaurantModel.countDocuments(query),
      restaurantModel.aggregate([
        {
          $group: {
            _id: "$kycStatus",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const counts = byStatus.reduce(
      (acc, row) => ({ ...acc, [row._id || "unknown"]: row.count || 0 }),
      { pending: 0, submitted: 0, approved: 0, rejected: 0 }
    );
    const submittedAgingThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const needsReviewCount = await restaurantModel.countDocuments({
      kycStatus: "submitted",
      kycSubmittedAt: { $lte: submittedAgingThreshold },
    });

    sendSuccess(res, req, 200, {
      success: true,
      data: rows,
      pagination: buildPaginationMeta(total, page, limit),
      queue: {
        filters: {
          status: status || (includeApproved ? "all" : "non_approved"),
          q,
          submittedBefore: submittedBeforeRaw || null,
          submittedAfter: submittedAfterRaw || null,
          includeApproved,
        },
        counts: {
          ...counts,
          total,
          submittedNeedsReview3d: needsReviewCount,
        },
        generatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error loading restaurant KYC queue");
  }
};

const getRestaurantByIdAdmin = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await restaurantModel.findById(restaurantId);
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    sendSuccess(res, req, 200, { success: true, data: restaurant });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching restaurant");
  }
};

// Get restaurant by ID
const getRestaurantById = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const restaurant = await restaurantModel.findById(restaurantId);
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    if (appConfig.requireRestaurantKycForOrders) {
      const s = restaurant.kycStatus;
      const ok =
        s === undefined ||
        s === null ||
        s === "approved";
      if (!ok) {
        return sendError(res, req, 404, "Restaurant not available");
      }
    }
    
    sendSuccess(res, req, 200, { success: true, data: restaurant });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching restaurant");
  }
};

// Create restaurant (Admin)
const createRestaurant = async (req, res) => {
  try {
    const {
      name,
      description,
      cuisine,
      image,
      deliveryTime,
      deliveryFee,
      minimumOrder,
      minimumPayoutAmount,
      deliveryRadiusKm,
      deliveryZones,
      address,
      openingTime,
      closingTime,
      weeklyHours,
      hourExceptions,
      commissionPercent,
      defaultTaxRatePercent,
      menuPricesIncludeTax,
    } = req.body;

    if (!name || !cuisine || !address) {
      return sendError(res, req, 400, "Name, cuisine, and address are required");
    }

    const econ = normalizeRestaurantEconomicsInput(req.body, { partial: false });

    const restaurant = new restaurantModel({
      name,
      description: description || '',
      cuisine,
      image: image || '',
      deliveryTime: deliveryTime || '30-45 min',
      deliveryFee: deliveryFee || 0,
      minimumOrder: minimumOrder || 0,
      minimumPayoutAmount: econ.minimumPayoutAmount,
      deliveryRadiusKm: econ.deliveryRadiusKm,
      deliveryZones: normalizeDeliveryZones(deliveryZones),
      address: {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        pincode: address.pincode || '',
        coordinates: address.coordinates || {}
      },
      openingTime: openingTime || '10:00 AM',
      closingTime: closingTime || '10:00 PM',
      weeklyHours: Array.isArray(weeklyHours) ? weeklyHours : [],
      hourExceptions: Array.isArray(hourExceptions) ? hourExceptions : [],
      commissionPercent: econ.commissionPercent,
      defaultTaxRatePercent: econ.defaultTaxRatePercent,
      menuPricesIncludeTax: econ.menuPricesIncludeTax,
    });

    if (appConfig.requireRestaurantKycForOrders) {
      restaurant.kycStatus = "pending";
      restaurant.kycSubmittedAt = new Date();
    }

    await restaurant.save();

    sendSuccess(res, req, 201, { 
      success: true, 
      message: "Restaurant created successfully",
      data: restaurant
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error creating restaurant");
  }
};

// Update restaurant (Admin)
const updateRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const updateData = { ...req.body };
    if (
      Object.prototype.hasOwnProperty.call(updateData, "deliveryZones") &&
      !Array.isArray(updateData.deliveryZones)
    ) {
      return sendError(res, req, 400, "deliveryZones must be an array");
    }
    if (Array.isArray(updateData.deliveryZones)) {
      updateData.deliveryZones = normalizeDeliveryZones(updateData.deliveryZones);
    }
    for (const k of [
      "kycStatus",
      "kycReviewNote",
      "kycSubmittedAt",
      "kycReviewedAt",
      "kycDocumentUrl",
    ]) {
      delete updateData[k];
    }
    Object.assign(updateData, normalizeRestaurantEconomicsInput(updateData, { partial: true }));

    if (
      updateData.menuPricesIncludeTax === true &&
      Object.prototype.hasOwnProperty.call(updateData, "defaultTaxRatePercent") &&
      Number(updateData.defaultTaxRatePercent) <= 0
    ) {
      return sendError(
        res,
        req,
        400,
        "defaultTaxRatePercent must be > 0 when menuPricesIncludeTax is enabled"
      );
    }

    const restaurant = await restaurantModel.findByIdAndUpdate(
      restaurantId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Restaurant updated successfully",
      data: restaurant
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating restaurant");
  }
};

const updateRestaurantKyc = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { kycStatus, kycReviewNote, kycDocumentUrl } = req.body;
    const actorUserId = String(req.body.userId || "");

    const allowed = ["pending", "submitted", "approved", "rejected"];
    if (!kycStatus || !allowed.includes(kycStatus)) {
      return sendError(
        res,
        req,
        400,
        "kycStatus must be one of: pending, submitted, approved, rejected"
      );
    }

    const restaurant = await restaurantModel.findById(restaurantId);
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    const fromStatus = String(restaurant.kycStatus || "pending");
    const transitions = {
      pending: ["submitted", "rejected", "pending"],
      submitted: ["approved", "rejected", "pending", "submitted"],
      approved: ["rejected", "approved"],
      rejected: ["submitted", "pending", "rejected"],
    };
    const allowedNext = transitions[fromStatus] || [];
    if (!allowedNext.includes(kycStatus)) {
      return sendError(
        res,
        req,
        400,
        `Invalid KYC transition: ${fromStatus} -> ${kycStatus}`,
        { allowedNext }
      );
    }

    const nextReviewNote =
      kycReviewNote !== undefined
        ? String(kycReviewNote).slice(0, 2000)
        : String(restaurant.kycReviewNote || "");
    const nextDocumentUrl =
      kycDocumentUrl !== undefined
        ? String(kycDocumentUrl).slice(0, 2000)
        : String(restaurant.kycDocumentUrl || "");
    if (kycStatus === "approved" && !nextDocumentUrl) {
      return sendError(
        res,
        req,
        400,
        "kycDocumentUrl is required before approving KYC"
      );
    }

    restaurant.kycStatus = kycStatus;
    if (kycReviewNote !== undefined) {
      restaurant.kycReviewNote = nextReviewNote;
    }
    if (kycDocumentUrl !== undefined) {
      restaurant.kycDocumentUrl = nextDocumentUrl;
    }
    if (kycStatus === "submitted" && !restaurant.kycSubmittedAt) {
      restaurant.kycSubmittedAt = new Date();
    }
    if (kycStatus === "approved" || kycStatus === "rejected") {
      restaurant.kycReviewedAt = new Date();
    }
    if (kycStatus !== fromStatus || kycReviewNote !== undefined || kycDocumentUrl !== undefined) {
      const history = Array.isArray(restaurant.kycHistory) ? restaurant.kycHistory : [];
      history.push({
        fromStatus,
        toStatus: kycStatus,
        note: nextReviewNote,
        documentUrl: nextDocumentUrl,
        changedBy: actorUserId,
        changedAt: new Date(),
      });
      restaurant.kycHistory = history.slice(-100);
    }

    await restaurant.save();

    sendSuccess(res, req, 200, {
      success: true,
      message: "KYC updated",
      data: restaurant,
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating KYC");
  }
};

// Phase 9: object-storage ready upload URL for KYC documents
const createRestaurantKycUploadUrl = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const extRaw = String(req.body.ext || req.query.ext || "pdf")
      .trim()
      .toLowerCase();
    const safeExt = ["pdf", "jpg", "jpeg", "png", "webp"].includes(extRaw) ? extRaw : "pdf";
    const contentTypeRaw = String(
      req.body.contentType || req.query.contentType || "application/pdf"
    )
      .trim()
      .toLowerCase();
    const allowedContentTypes = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    const contentType = allowedContentTypes.has(contentTypeRaw)
      ? contentTypeRaw
      : "application/pdf";

    const restaurant = await restaurantModel.findById(restaurantId).select("_id");
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    const key = `kyc_${String(restaurantId)}_${Date.now()}.${safeExt}`;
    const uploadUrl = await createSignedPutUrl({ key, contentType });
    if (!uploadUrl) {
      return sendError(
        res,
        req,
        400,
        "Signed upload URL unavailable (object storage provider not configured)"
      );
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        key,
        uploadUrl,
        publicUrl: getMediaPublicUrl(key),
        contentType,
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error creating KYC upload URL");
  }
};

// Phase 9: finalize direct-uploaded KYC document key
const finalizeRestaurantKycUpload = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const key = normalizeUploadedMediaKey(req.body.key);
    if (!key) {
      return sendError(res, req, 400, "Valid key is required");
    }
    const actorUserId = String(req.body.userId || "");
    const restaurant = await restaurantModel.findById(restaurantId);
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    const fromStatus = String(restaurant.kycStatus || "pending");
    const nextStatus = fromStatus === "approved" ? fromStatus : "submitted";
    restaurant.kycDocumentUrl = key;
    if (nextStatus === "submitted") {
      restaurant.kycStatus = "submitted";
      restaurant.kycSubmittedAt = new Date();
      restaurant.kycReviewedAt = null;
    }
    const history = Array.isArray(restaurant.kycHistory) ? restaurant.kycHistory : [];
    history.push({
      fromStatus,
      toStatus: String(restaurant.kycStatus || "submitted"),
      note: "KYC document uploaded",
      documentUrl: key,
      changedBy: actorUserId,
      changedAt: new Date(),
    });
    restaurant.kycHistory = history.slice(-100);
    await restaurant.save();

    return sendSuccess(res, req, 200, {
      success: true,
      message: "KYC document key finalized",
      data: {
        restaurantId: String(restaurant._id),
        kycStatus: restaurant.kycStatus,
        kycDocumentUrl: restaurant.kycDocumentUrl,
        kycDocumentPublicUrl: getMediaPublicUrl(restaurant.kycDocumentUrl),
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error finalizing KYC document key");
  }
};

const debugDeliveryCoverage = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const lat = Number(req.query.lat ?? req.body?.lat);
    const lng = Number(req.query.lng ?? req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return sendError(res, req, 400, "lat and lng are required as numeric values");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return sendError(res, req, 400, "lat/lng out of range");
    }

    const restaurant = await restaurantModel.findById(restaurantId).lean();
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    const activeZones = Array.isArray(restaurant.deliveryZones)
      ? restaurant.deliveryZones.filter((z) => z?.isActive !== false)
      : [];
    const zoneChecks = activeZones.map((z) => ({
      id: z.id || "",
      name: z.name || "",
      inPolygon: isPointInPolygon(lat, lng, z.polygon || []),
      points: Array.isArray(z.polygon) ? z.polygon.length : 0,
    }));
    const inAnyZone = zoneChecks.some((z) => z.inPolygon === true);
    const radiusDistanceKm = haversineKm(
      restaurant?.address?.coordinates?.lat,
      restaurant?.address?.coordinates?.lng,
      lat,
      lng
    );
    const radiusResult = isWithinDeliveryRadius(
      { ...restaurant, deliveryZones: [] },
      lat,
      lng
    );
    const effectiveResult = isWithinDeliveryRadius(restaurant, lat, lng);

    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        restaurantId: String(restaurant._id),
        point: { lat, lng },
        activeZoneCount: activeZones.length,
        zones: zoneChecks,
        inAnyZone,
        radiusKm: restaurant.deliveryRadiusKm ?? null,
        radiusDistanceKm,
        radiusResult,
        effectiveResult,
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error testing delivery coverage");
  }
};

// Delete restaurant (Admin)
const deleteRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await restaurantModel.findByIdAndDelete(restaurantId);
    if (!restaurant) {
      return sendError(res, req, 404, "Restaurant not found");
    }

    sendSuccess(res, req, 200, { success: true, message: "Restaurant deleted successfully" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error deleting restaurant");
  }
};

export {
  getRestaurants,
  getRestaurantsAdmin,
  searchRestaurants,
  getRestaurantKycQueue,
  getRestaurantById,
  getRestaurantByIdAdmin,
  createRestaurant,
  updateRestaurant,
  updateRestaurantKyc,
  createRestaurantKycUploadUrl,
  finalizeRestaurantKycUpload,
  debugDeliveryCoverage,
  deleteRestaurant,
};

