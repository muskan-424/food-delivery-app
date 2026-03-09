import foodModel from "../models/foodModel.js";
import userModel from "../models/userModel.js";
import fs from "fs";
import path from "path";

// add food items
const addFood = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image file is required" });
    }

    let image_filename = req.file.filename;
    const food = new foodModel({
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      category: req.body.category,
      image: image_filename, // Store only filename, not full path
    });
    
    await food.save();
    
    // Return food data with full image URL for frontend convenience
    const foodResponse = food.toObject();
    foodResponse.imageUrl = `/images/${image_filename}`;
    
    res.status(201).json({ 
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
    res.status(500).json({ success: false, message: "Error adding food item" });
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
    
    // Ensure all foods have image field and add full image URL
    const foodsWithImages = foods.map(food => ({
      ...food,
      image: food.image || null, // Ensure image field exists
      imageUrl: food.image ? `/images/${food.image}` : null // Add full URL for convenience
    }));
    
    const total = await foodModel.countDocuments(query);
    const totalPages = Math.ceil(total / actualLimit);
    
    res.status(200).json({ 
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
    res.status(500).json({ success: false, message: "Error fetching foods" });
  }
};

// update food item
const updateFood = async (req, res) => {
  try {
    const { foodId } = req.params;
    const food = await foodModel.findById(foodId);
    
    if (!food) {
      return res.status(404).json({ success: false, message: "Food item not found" });
    }

    // Update fields
    if (req.body.name) food.name = req.body.name;
    if (req.body.description) food.description = req.body.description;
    if (req.body.price) food.price = parseFloat(req.body.price);
    if (req.body.category) food.category = req.body.category;
    if (req.body.isAvailable !== undefined) food.isAvailable = req.body.isAvailable;

    // Handle image update if new image is uploaded
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
    }

    await food.save();

    const foodResponse = food.toObject();
    foodResponse.imageUrl = food.image ? `/images/${food.image}` : null;

    res.status(200).json({ 
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
    res.status(500).json({ success: false, message: "Error updating food item" });
  }
};

// get single food item by ID
const getFoodById = async (req, res) => {
  try {
    const { foodId } = req.params;
    const food = await foodModel.findById(foodId);
    
    if (!food) {
      return res.status(404).json({ success: false, message: "Food item not found" });
    }

    const foodResponse = food.toObject();
    foodResponse.imageUrl = food.image ? `/images/${food.image}` : null;

    res.status(200).json({ 
      success: true, 
      data: foodResponse 
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching food item" });
  }
};

// remove food item
const removeFood = async (req, res) => {
  try {
    const food = await foodModel.findById(req.body.id);
    if (!food) {
      return res.status(404).json({ success: false, message: "Food item not found" });
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
    res.status(200).json({ success: true, message: "Food Removed" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error removing food item" });
  }
};

export { addFood, listFood, getFoodById, updateFood, removeFood };
