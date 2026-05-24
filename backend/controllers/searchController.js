import foodModel from "../models/foodModel.js";
import restaurantModel from "../models/restaurantModel.js";
import { appConfig } from "../config/appConfig.js";
import { publicRestaurantMatchForKycGate, isRestaurantOrderable } from "../utils/restaurantKycUtils.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { getMediaPublicUrl } from "../utils/mediaStorage.js";

function escRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreText(query, text) {
  const q = String(query || "").trim().toLowerCase();
  const t = String(text || "").trim().toLowerCase();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 70;
  if (t.includes(` ${q}`)) return 45;
  if (t.includes(q)) return 30;
  const tokens = q.split(/\s+/).filter(Boolean);
  let tokenHits = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) tokenHits += 1;
  }
  return tokenHits > 0 ? tokenHits * 10 : 0;
}

function scoreRestaurant(q, row) {
  const name = scoreText(q, row.name);
  const cuisine = scoreText(q, row.cuisine);
  const city = scoreText(q, row?.address?.city || "");
  const desc = scoreText(q, row.description || "");
  const ratingBoost = Math.min(10, Number(row.rating || 0) * 2);
  return name * 1.8 + cuisine * 1.3 + city * 0.8 + desc * 0.5 + ratingBoost;
}

function scoreFood(q, row) {
  const name = scoreText(q, row.name);
  const category = scoreText(q, row.category);
  const desc = scoreText(q, row.description || "");
  const ratingBoost = Math.min(10, Number(row.rating || 0) * 2);
  return name * 1.9 + category * 1.1 + desc * 0.6 + ratingBoost;
}

const unifiedSearch = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (!q || q.length < 2) {
      return sendError(res, req, 400, "q must be at least 2 characters");
    }
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
    const include = String(req.query.include || "all").trim().toLowerCase(); // all|food|restaurant
    const rx = { $regex: escRe(q), $options: "i" };

    const restaurantQuery = {
      $or: [
        { name: rx },
        { cuisine: rx },
        { description: rx },
        { "address.city": rx },
        { "address.state": rx },
      ],
      isActive: true,
      ...publicRestaurantMatchForKycGate(),
    };
    const foodQuery = {
      isAvailable: true,
      $or: [{ name: rx }, { description: rx }, { category: rx }],
    };

    let approvedIds = null;
    if (appConfig.requireRestaurantKycForOrders) {
      const approved = await restaurantModel
        .find({
          $or: [{ kycStatus: "approved" }, { kycStatus: { $exists: false } }],
        })
        .select("_id")
        .lean();
      approvedIds = approved.map((x) => x._id);
      foodQuery.$or = [
        ...(foodQuery.$or || []),
      ];
      foodQuery.$and = [
        { $or: foodQuery.$or },
        { $or: [{ restaurantId: null }, { restaurantId: { $in: approvedIds } }] },
      ];
      delete foodQuery.$or;
    }

    const [restaurantsRaw, foodsRaw] = await Promise.all([
      include === "food"
        ? []
        : restaurantModel
            .find(restaurantQuery)
            .select("name cuisine description rating totalRatings isOpen isActive address image")
            .limit(200)
            .lean(),
      include === "restaurant"
        ? []
        : foodModel
            .find(foodQuery)
            .select("name category description price image rating totalRatings isAvailable restaurantId")
            .limit(250)
            .lean(),
    ]);

    let restaurants = restaurantsRaw;
    if (appConfig.requireRestaurantKycForOrders) {
      restaurants = restaurants.filter((r) => isRestaurantOrderable(r));
    }

    const restaurantResults = restaurants.map((r) => ({
      type: "restaurant",
      score: Math.round(scoreRestaurant(q, r) * 100) / 100,
      item: {
        ...r,
          imageUrl: getMediaPublicUrl(r.image),
      },
    }));
    const foodResults = foodsRaw.map((f) => ({
      type: "food",
      score: Math.round(scoreFood(q, f) * 100) / 100,
      item: {
        ...f,
          imageUrl: getMediaPublicUrl(f.image),
      },
    }));

    const combined = [...restaurantResults, ...foodResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sendSuccess(res, req, 200, {
      success: true,
      data: combined,
      meta: {
        q,
        include,
        limit,
        counts: {
          restaurants: restaurantResults.length,
          foods: foodResults.length,
          returned: combined.length,
        },
      },
    });
  } catch (error) {
    console.error("unifiedSearch:", error);
    return sendError(res, req, 500, "Error searching");
  }
};

export { unifiedSearch };

