import foodModel from "../models/foodModel.js";
import restaurantModel from "../models/restaurantModel.js";
import { appConfig } from "../config/appConfig.js";
import { isRestaurantOrderable } from "../utils/restaurantKycUtils.js";
import userModel from "../models/userModel.js";
import fs from "fs";
import path from "path";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { createSignedPutUrl, getMediaPublicUrl } from "../utils/mediaStorage.js";
import { normalizeUploadedMediaKey } from "../utils/mediaKeyValidation.js";

function parseModifierGroups(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

// add food items
const addFood = async (req, res) => {
  try {
    const imageKey = normalizeUploadedMediaKey(req.body.imageKey);
    let image_filename = req.file?.filename || imageKey || "";
    if (!image_filename) {
      return sendError(res, req, 400, "Image file or imageKey is required");
    }

    let restaurantId = req.body.restaurantId || null;
    if (restaurantId === "") restaurantId = null;
    if (restaurantId) {
      const r = await restaurantModel.findById(restaurantId);
      if (!r) {
        return sendError(res, req, 400, "Invalid restaurantId");
      }
    }

    const modifierGroups = parseModifierGroups(req.body.modifierGroups);
    let stockCount = null;
    if (req.body.stockCount !== undefined && req.body.stockCount !== "") {
      const n = parseInt(req.body.stockCount, 10);
      if (!Number.isNaN(n) && n >= 0) stockCount = n;
    }

    const food = new foodModel({
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      category: req.body.category,
      image: image_filename,
      restaurantId: restaurantId || null,
      modifierGroups,
      stockCount,
    });
    
    await food.save();
    
    // Return food data with full image URL for frontend convenience
    const foodResponse = food.toObject();
    foodResponse.imageUrl = getMediaPublicUrl(image_filename);
    
    sendSuccess(res, req, 201, { 
      success: true, 
      message: "Food Added", 
      data: foodResponse 
    });
  } catch (error) {
    console.log(error);
    // If food creation fails, delete uploaded file
    if (req.file) {
      fs.unlink(`uploads/${req.file.filename}`, () => {});
    }
    sendError(res, req, 500, "Error adding food item");
  }
};

// all foods with pagination, search, and advanced filtering
const listFood = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Default 20, max 100
    const maxLimit = 100;
    const actualLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * actualLimit;
    
    // Build query object for filtering
    const query = {};

    if (req.query.restaurantId) {
      query.restaurantId = req.query.restaurantId;
    }

    if (req.query.availableOnly === "true" || req.query.availableOnly === "1") {
      query.isAvailable = true;
    }
    
    // Category filter
    if (req.query.category && req.query.category !== 'All') {
      query.category = req.query.category;
    }
    
    // Text search (searches in name and description)
    if (req.query.search && req.query.search.trim() !== '') {
      const searchTerm = req.query.search.trim();
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } }, // Case-insensitive search in name
        { description: { $regex: searchTerm, $options: 'i' } } // Case-insensitive search in description
      ];
    }
    
    // Price range filter
    if (req.query.minPrice) {
      const minPrice = parseFloat(req.query.minPrice);
      if (!isNaN(minPrice) && minPrice >= 0) {
        query.price = { ...query.price, $gte: minPrice };
      }
    }
    
    if (req.query.maxPrice) {
      const maxPrice = parseFloat(req.query.maxPrice);
      if (!isNaN(maxPrice) && maxPrice >= 0) {
        query.price = { ...query.price, $lte: maxPrice };
      }
    }

    if (appConfig.requireRestaurantKycForOrders && req.query.restaurantId) {
      const r = await restaurantModel.findById(req.query.restaurantId);
      if (!r || !isRestaurantOrderable(r)) {
        return sendError(res, req, 404, "Restaurant not found or not available");
      }
    }

    if (appConfig.requireRestaurantKycForOrders && !req.query.restaurantId) {
      const approved = await restaurantModel
        .find({
          $or: [{ kycStatus: "approved" }, { kycStatus: { $exists: false } }],
        })
        .select("_id")
        .lean();
      const ids = approved.map((x) => x._id);
      const kycOr = [
        { restaurantId: null },
        { restaurantId: { $exists: false } },
        { restaurantId: { $in: ids } },
      ];
      if (query.$or) {
        const searchOr = query.$or;
        delete query.$or;
        query.$and = [{ $or: searchOr }, { $or: kycOr }];
      } else {
        query.$or = kycOr;
      }
    }
    
    // Sorting options
    let sortOption = { price: 1 }; // Default: price low to high
    if (req.query.sortBy) {
      const sortBy = req.query.sortBy;
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
      
      switch (sortBy) {
        case 'price':
          sortOption = { price: sortOrder };
          break;
        case 'name':
          sortOption = { name: sortOrder };
          break;
        case 'category':
          sortOption = { category: sortOrder };
          break;
        case 'rating':
          sortOption = { rating: sortOrder };
          break;
        default:
          sortOption = { price: 1 };
      }
    }
    
    const foods = await foodModel
      .find(query)
      .limit(actualLimit)
      .skip(skip)
      .sort(sortOption)
      .lean(); // Use lean() for better performance

    const restIds = [
      ...new Set(
        foods.map((f) => f.restaurantId).filter(Boolean).map((id) => String(id))
      ),
    ];
    let restaurantTaxById = new Map();
    if (restIds.length > 0) {
      const rests = await restaurantModel
        .find({ _id: { $in: restIds } })
        .select("defaultTaxRatePercent menuPricesIncludeTax")
        .lean();
      restaurantTaxById = new Map(
        rests.map((r) => [
          String(r._id),
          {
            menuPricesIncludeTax: !!r.menuPricesIncludeTax,
            defaultTaxRatePercent: Number(r.defaultTaxRatePercent) || 0,
          },
        ])
      );
    }
    
    // Ensure all foods have image field and add full image URL
    const foodsWithImages = foods.map((food) => {
      const tax =
        food.restaurantId != null
          ? restaurantTaxById.get(String(food.restaurantId)) || {
              menuPricesIncludeTax: false,
              defaultTaxRatePercent: 0,
            }
          : { menuPricesIncludeTax: false, defaultTaxRatePercent: 0 };
      return {
        ...food,
        image: food.image || null, // Ensure image field exists
        imageUrl: getMediaPublicUrl(food.image), // Add full URL for convenience
        restaurantMenuTax: tax,
      };
    });
    
    const total = await foodModel.countDocuments(query);
    const totalPages = Math.ceil(total / actualLimit);
    
    sendSuccess(res, req, 200, { 
      success: true, 
      data: foodsWithImages,
      pagination: {
        page,
        limit: actualLimit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        search: req.query.search || '',
        category: req.query.category || 'All',
        minPrice: req.query.minPrice || '',
        maxPrice: req.query.maxPrice || '',
        sortBy: req.query.sortBy || 'date',
        sortOrder: req.query.sortOrder || 'desc'
      }
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching foods");
  }
};

// search foods (Phase 9 baseline)
const searchFood = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (!q || q.length < 2) {
      return sendError(res, req, 400, "q must be at least 2 characters");
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const category = String(req.query.category || "").trim();
    const restaurantId = String(req.query.restaurantId || "").trim();

    const textRegex = { $regex: q, $options: "i" };
    const query = {
      isAvailable: true,
      $or: [{ name: textRegex }, { description: textRegex }, { category: textRegex }],
    };
    if (category && category.toLowerCase() !== "all") {
      query.category = category;
    }
    if (restaurantId) {
      query.restaurantId = restaurantId;
    }

    if (appConfig.requireRestaurantKycForOrders) {
      if (restaurantId) {
        const r = await restaurantModel.findById(restaurantId);
        if (!r || !isRestaurantOrderable(r)) {
          return sendError(res, req, 404, "Restaurant not found or not available");
        }
      } else {
        const approved = await restaurantModel
          .find({
            $or: [{ kycStatus: "approved" }, { kycStatus: { $exists: false } }],
          })
          .select("_id")
          .lean();
        const ids = approved.map((x) => x._id);
        query.$and = [{ $or: query.$or }, { $or: [{ restaurantId: null }, { restaurantId: { $in: ids } }] }];
        delete query.$or;
      }
    }

    const [rows, total] = await Promise.all([
      foodModel
        .find(query)
        .sort({ rating: -1, totalRatings: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      foodModel.countDocuments(query),
    ]);

    const data = rows.map((food) => ({
      ...food,
      imageUrl: getMediaPublicUrl(food.image),
    }));

    return sendSuccess(res, req, 200, {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      query: { q, category: category || null, restaurantId: restaurantId || null },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error searching foods");
  }
};

// Phase 9: object-storage ready signed upload URL for food image
const createFoodImageUploadUrl = async (req, res) => {
  try {
    const extRaw = String(req.body.ext || req.query.ext || "jpg")
      .trim()
      .toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(extRaw) ? extRaw : "jpg";
    const contentTypeRaw = String(req.body.contentType || req.query.contentType || "image/jpeg")
      .trim()
      .toLowerCase();
    const allowedContentTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ]);
    const contentType = allowedContentTypes.has(contentTypeRaw)
      ? contentTypeRaw
      : "image/jpeg";
    const key = `food_${Date.now()}_${Math.floor(Math.random() * 10000)}.${safeExt}`;
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
        imageUrl: getMediaPublicUrl(key),
        contentType,
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error creating food image upload URL");
  }
};

// Phase 9: finalize direct-uploaded food image key
const finalizeFoodImageUpload = async (req, res) => {
  try {
    const { foodId } = req.params;
    const key = normalizeUploadedMediaKey(req.body.key);
    if (!key) {
      return sendError(res, req, 400, "Valid key is required");
    }
    const food = await foodModel.findById(foodId);
    if (!food) {
      return sendError(res, req, 404, "Food item not found");
    }
    food.image = key;
    await food.save();
    const data = food.toObject();
    data.imageUrl = getMediaPublicUrl(food.image);
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Food image key finalized",
      data,
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error finalizing food image key");
  }
};

// update food item
const updateFood = async (req, res) => {
  try {
    const { foodId } = req.params;
    const food = await foodModel.findById(foodId);
    
    if (!food) {
      return sendError(res, req, 404, "Food item not found");
    }

    // Update fields
    if (req.body.name) food.name = req.body.name;
    if (req.body.description) food.description = req.body.description;
    if (req.body.price) food.price = parseFloat(req.body.price);
    if (req.body.category) food.category = req.body.category;
    if (req.body.isAvailable !== undefined) food.isAvailable = req.body.isAvailable;
    if (req.body.restaurantId !== undefined) {
      if (!req.body.restaurantId) {
        food.restaurantId = null;
      } else {
        const r = await restaurantModel.findById(req.body.restaurantId);
        if (!r) {
          return sendError(res, req, 400, "Invalid restaurantId");
        }
        food.restaurantId = req.body.restaurantId;
      }
    }
    if (req.body.modifierGroups !== undefined) {
      food.modifierGroups = parseModifierGroups(req.body.modifierGroups);
    }
    if (req.body.stockCount !== undefined) {
      if (req.body.stockCount === "" || req.body.stockCount === null) {
        food.stockCount = null;
      } else {
        const n = parseInt(req.body.stockCount, 10);
        if (!Number.isNaN(n) && n >= 0) food.stockCount = n;
      }
    }

    // Handle image update if new image is uploaded
    const imageKey = normalizeUploadedMediaKey(req.body.imageKey);
    if (req.file) {
      // Delete old image if it exists
      if (food.image) {
        const oldImagePath = path.join("uploads", path.basename(food.image));
        fs.unlink(oldImagePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error("Error deleting old image:", err);
          }
        });
      }
      food.image = req.file.filename;
    } else if (imageKey) {
      food.image = imageKey;
    }

    await food.save();

    const foodResponse = food.toObject();
    foodResponse.imageUrl = getMediaPublicUrl(food.image);

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Food item updated successfully", 
      data: foodResponse 
    });
  } catch (error) {
    console.log(error);
    // If update fails and new file was uploaded, delete it
    if (req.file) {
      fs.unlink(`uploads/${req.file.filename}`, () => {});
    }
    sendError(res, req, 500, "Error updating food item");
  }
};

// get single food item by ID
const getFoodById = async (req, res) => {
  try {
    const { foodId } = req.params;
    const food = await foodModel.findById(foodId);
    
    if (!food) {
      return sendError(res, req, 404, "Food item not found");
    }

    const foodResponse = food.toObject();
    foodResponse.imageUrl = getMediaPublicUrl(food.image);

    sendSuccess(res, req, 200, { 
      success: true, 
      data: foodResponse 
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching food item");
  }
};

// remove food item
const removeFood = async (req, res) => {
  try {
    const food = await foodModel.findById(req.body.id);
    if (!food) {
      return sendError(res, req, 404, "Food item not found");
    }
    
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(food.image);
    const filePath = path.join("uploads", sanitizedFilename);
    
    // Delete file from filesystem
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error("File deletion error:", err);
      }
    });
    
    await foodModel.findByIdAndDelete(req.body.id);
    sendSuccess(res, req, 200, { success: true, message: "Food Removed" });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error removing food item");
  }
};

const updateFoodStock = async (req, res) => {
  try {
    const { foodId } = req.params;
    const { stockCount, delta, isAvailable } = req.body;

    const hasStockCount = Object.prototype.hasOwnProperty.call(req.body, "stockCount");
    const hasDelta = Object.prototype.hasOwnProperty.call(req.body, "delta");
    const hasAvailability = Object.prototype.hasOwnProperty.call(req.body, "isAvailable");
    if (!hasStockCount && !hasDelta && !hasAvailability) {
      return sendError(res, req, 400, "Provide at least one of: stockCount, delta, isAvailable");
    }

    const food = await foodModel.findById(foodId);
    if (!food) {
      return sendError(res, req, 404, "Food item not found");
    }

    if (hasStockCount) {
      if (stockCount === null || stockCount === "") {
        food.stockCount = null;
      } else {
        const parsed = parseInt(stockCount, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
          return sendError(res, req, 400, "stockCount must be null or a non-negative integer");
        }
        food.stockCount = parsed;
      }
    }

    if (hasDelta) {
      const parsedDelta = parseInt(delta, 10);
      if (Number.isNaN(parsedDelta)) {
        return sendError(res, req, 400, "delta must be an integer");
      }
      if (food.stockCount == null) {
        return sendError(res, req, 400, "Cannot apply delta when stockCount is unlimited (null)");
      }
      const nextCount = food.stockCount + parsedDelta;
      if (nextCount < 0) {
        return sendError(res, req, 400, "delta would reduce stock below zero");
      }
      food.stockCount = nextCount;
    }

    if (hasAvailability) {
      food.isAvailable = Boolean(isAvailable);
    } else if (food.stockCount != null) {
      food.isAvailable = food.stockCount > 0;
    }

    await food.save();
    const data = food.toObject();
    data.imageUrl = getMediaPublicUrl(food.image);

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Food stock updated successfully",
      data,
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error updating food stock");
  }
};

const bulkUpdateFoodStock = async (req, res) => {
  try {
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (updates.length === 0) {
      return sendError(res, req, 400, "updates array is required");
    }
    if (updates.length > 200) {
      return sendError(res, req, 400, "Maximum 200 updates per request");
    }

    const results = [];
    let updated = 0;

    for (const row of updates) {
      const foodId = row?.foodId;
      if (!foodId) {
        results.push({ foodId: "", ok: false, message: "foodId is required" });
        continue;
      }

      const food = await foodModel.findById(foodId);
      if (!food) {
        results.push({ foodId: String(foodId), ok: false, message: "Food item not found" });
        continue;
      }

      const hasStockCount = Object.prototype.hasOwnProperty.call(row, "stockCount");
      const hasDelta = Object.prototype.hasOwnProperty.call(row, "delta");
      const hasAvailability = Object.prototype.hasOwnProperty.call(row, "isAvailable");
      if (!hasStockCount && !hasDelta && !hasAvailability) {
        results.push({
          foodId: String(foodId),
          ok: false,
          message: "Provide stockCount, delta or isAvailable",
        });
        continue;
      }

      let rowError = "";
      if (hasStockCount) {
        if (row.stockCount === null || row.stockCount === "") {
          food.stockCount = null;
        } else {
          const parsed = parseInt(row.stockCount, 10);
          if (Number.isNaN(parsed) || parsed < 0) {
            rowError = "stockCount must be null or a non-negative integer";
          } else {
            food.stockCount = parsed;
          }
        }
      }

      if (!rowError && hasDelta) {
        const parsedDelta = parseInt(row.delta, 10);
        if (Number.isNaN(parsedDelta)) {
          rowError = "delta must be an integer";
        } else if (food.stockCount == null) {
          rowError = "Cannot apply delta when stockCount is unlimited (null)";
        } else if (food.stockCount + parsedDelta < 0) {
          rowError = "delta would reduce stock below zero";
        } else {
          food.stockCount += parsedDelta;
        }
      }

      if (rowError) {
        results.push({ foodId: String(foodId), ok: false, message: rowError });
        continue;
      }

      if (hasAvailability) {
        food.isAvailable = Boolean(row.isAvailable);
      } else if (food.stockCount != null) {
        food.isAvailable = food.stockCount > 0;
      }

      await food.save();
      updated += 1;
      results.push({
        foodId: String(foodId),
        ok: true,
        stockCount: food.stockCount,
        isAvailable: food.isAvailable,
      });
    }

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Bulk stock update completed",
      data: { requested: updates.length, updated, results },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error bulk updating food stock");
  }
};

export {
  addFood,
  listFood,
  searchFood,
  createFoodImageUploadUrl,
  finalizeFoodImageUpload,
  getFoodById,
  updateFood,
  removeFood,
  updateFoodStock,
  bulkUpdateFoodStock,
};
