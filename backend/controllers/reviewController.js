import reviewModel from "../models/reviewModel.js";
import foodModel from "../models/foodModel.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import mongoose from "mongoose";
import { analyzeSentiment, shouldAutoApprove } from "../utils/sentimentAnalysis.js";

const hydrateReviewUserData = async (reviews = []) => {
  if (!Array.isArray(reviews) || reviews.length === 0) return reviews;

  const missingUserIds = [
    ...new Set(
      reviews
        .filter((review) => (!review.userName || !review.userAvatar) && review.userId)
        .map((review) => review.userId.toString())
    ),
  ];

  if (missingUserIds.length === 0) return reviews;

  const validObjectIds = missingUserIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (validObjectIds.length === 0) return reviews;

  const users = await userModel
    .find({ _id: { $in: validObjectIds } })
    .select("name email profilePicture");

  const userMap = {};
  users.forEach((user) => {
    userMap[user._id.toString()] = user;
  });

  reviews.forEach((review) => {
    const mapKey = review.userId?.toString();
    const user = userMap[mapKey];
    if (user) {
      if (!review.userName) {
        review.userName =
          user.name || (user.email ? user.email.split("@")[0] : "Foodie");
      }
      if (!review.userAvatar && user.profilePicture) {
        review.userAvatar = user.profilePicture;
      }
    }
  });

  return reviews;
};

// Add review
const addReview = async (req, res) => {
  try {
    const { foodId, orderId, rating, comment, images } = req.body;
    const userId = req.body.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!foodId || !rating) {
      return res.status(400).json({ success: false, message: "Food ID and rating are required" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    // Convert foodId to ObjectId if it's a string (do this early)
    let foodObjectId;
    try {
      foodObjectId = mongoose.Types.ObjectId.isValid(foodId) ? new mongoose.Types.ObjectId(foodId) : foodId;
    } catch (idError) {
      return res.status(400).json({ success: false, message: "Invalid food ID format" });
    }

    // Verify order if orderId provided
    if (orderId) {
      const orderObjectId = mongoose.Types.ObjectId.isValid(orderId) ? new mongoose.Types.ObjectId(orderId) : orderId;
      const order = await orderModel.findOne({ _id: orderObjectId, userId });
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
      // Check if order contains this food item
      const hasFood = order.items.some(item => {
        const itemFoodId = item.foodId?.toString() || item.foodId;
        return itemFoodId === foodObjectId.toString();
      });
      if (!hasFood) {
        return res.status(400).json({ success: false, message: "Food item not in this order" });
      }
    }

    // Check if review already exists for this order and food item
    if (orderId) {
      const orderObjectId = mongoose.Types.ObjectId.isValid(orderId) ? new mongoose.Types.ObjectId(orderId) : orderId;
      const existingReview = await reviewModel.findOne({ userId, foodId: foodObjectId, orderId: orderObjectId });
      if (existingReview) {
        return res.status(409).json({ 
          success: false, 
          message: "Review already exists for this item in this order. Update existing review instead.",
          reviewId: existingReview._id
        });
      }
    } else {
      // If no orderId, check for any existing review (backward compatibility)
      const existingReview = await reviewModel.findOne({ userId, foodId: foodObjectId, orderId: null });
      if (existingReview) {
        return res.status(409).json({ 
          success: false, 
          message: "Review already exists. Update existing review instead.",
          reviewId: existingReview._id
        });
      }
    }

    const user = await userModel.findById(userId).select("name email profilePicture");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const userDisplayName = user.name || (user.email ? user.email.split("@")[0] : "Foodie");
    const userAvatar = user.profilePicture || "";

    const food = await foodModel.findById(foodObjectId);
    if (!food) {
      return res.status(404).json({ success: false, message: "Food item not found" });
    }

    // Perform sentiment analysis
    let sentimentResult;
    try {
      sentimentResult = analyzeSentiment(comment?.trim() || '', rating);
    } catch (sentimentError) {
      console.error("Error in sentiment analysis:", sentimentError);
      // Use default sentiment if analysis fails
      sentimentResult = {
        label: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
        score: 0,
        confidence: 70,
        combinedScore: rating / 5,
        rating: rating // Add rating for shouldAutoApprove function
      };
    }
    
    // Determine initial status based on sentiment (auto-approve highly positive reviews)
    let initialStatus = 'pending';
    try {
      if (shouldAutoApprove(sentimentResult)) {
        initialStatus = 'approved';
      }
    } catch (approvalError) {
      console.error("Error in auto-approval check:", approvalError);
      // Default to pending if auto-approval check fails
    }

    const review = new reviewModel({
      userId: String(userId), // Ensure userId is a string
      userName: userDisplayName,
      userAvatar,
      foodId: foodObjectId, // Use converted ObjectId
      orderId: orderId ? (mongoose.Types.ObjectId.isValid(orderId) ? new mongoose.Types.ObjectId(orderId) : orderId) : null,
      restaurantId: food.restaurantId || null,
      rating,
      comment: comment?.trim() || '',
      images: images || [],
      isVerified: !!orderId,
      status: initialStatus,
      sentiment: {
        label: sentimentResult.label,
        score: sentimentResult.score,
        confidence: sentimentResult.confidence,
        analyzedAt: new Date()
      }
    });

    await review.save();

    // Update food item rating (only count approved and visible reviews)
    const approvedReviews = await reviewModel.find({ 
      foodId: foodObjectId, 
      status: 'approved', 
      isVisible: true 
    });
    
    if (approvedReviews.length > 0) {
      const avgRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length;
      food.rating = Math.round(avgRating * 10) / 10; // Round to 1 decimal
      food.totalRatings = approvedReviews.length;
    } else {
      food.rating = 0;
      food.totalRatings = 0;
    }
    await food.save();

    res.status(201).json({ 
      success: true, 
      message: "Review added successfully",
      data: review
    });
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error adding review",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get reviews for a food item (only approved and visible)
const getFoodReviews = async (req, res) => {
  try {
    const { foodId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reviews = await reviewModel
      .find({ foodId, status: 'approved', isVisible: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    await hydrateReviewUserData(reviews);

    const total = await reviewModel.countDocuments({ foodId, status: 'approved', isVisible: true });

    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching reviews" });
  }
};

// Get reviews for an order
const getOrderReviews = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.body.userId;

    // Verify order belongs to user
    const order = await orderModel.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Get all reviews for this order
    const reviews = await reviewModel
      .find({ orderId, userId })
      .populate('foodId', 'name image')
      .sort({ createdAt: -1 })
      .lean();

    await hydrateReviewUserData(reviews);

    // Create a map of foodId to review for easy lookup
    const reviewMap = {};
    reviews.forEach(review => {
      if (review.foodId && review.foodId._id) {
        reviewMap[review.foodId._id.toString()] = review;
      }
    });

    res.status(200).json({
      success: true,
      data: reviews,
      reviewMap: reviewMap, // Map for easy frontend lookup
      orderItems: order.items || []
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching order reviews" });
  }
};

// Update review
const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment, images } = req.body;
    const userId = req.body.userId;

    const review = await reviewModel.findOne({ _id: reviewId, userId });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
      }
      review.rating = rating;
    }

    if (comment !== undefined) review.comment = comment.trim();
    if (images !== undefined) review.images = images;
    
    // Re-analyze sentiment if rating or comment changed
    if (rating !== undefined || comment !== undefined) {
      const sentimentResult = analyzeSentiment(review.comment, review.rating);
      review.sentiment = {
        label: sentimentResult.label,
        score: sentimentResult.score,
        confidence: sentimentResult.confidence,
        analyzedAt: new Date()
      };
      
      // Re-evaluate auto-approval status
      if (shouldAutoApprove(sentimentResult) && review.status === 'pending') {
        review.status = 'approved';
      }
    }

    await review.save();

    // Update food item rating (only count approved and visible reviews)
    const food = await foodModel.findById(review.foodId);
    if (food) {
      const approvedReviews = await reviewModel.find({ 
        foodId: review.foodId, 
        status: 'approved', 
        isVisible: true 
      });
      
      if (approvedReviews.length > 0) {
        const avgRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length;
        food.rating = Math.round(avgRating * 10) / 10;
        food.totalRatings = approvedReviews.length;
      } else {
        food.rating = 0;
        food.totalRatings = 0;
      }
      await food.save();
    }

    res.status(200).json({ 
      success: true, 
      message: "Review updated successfully",
      data: review
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating review" });
  }
};

// Delete review
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.body.userId;

    const review = await reviewModel.findOne({ _id: reviewId, userId });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const foodId = review.foodId;
    await reviewModel.findByIdAndDelete(reviewId);

    // Update food item rating (only count approved and visible reviews)
    const food = await foodModel.findById(foodId);
    if (food) {
      const approvedReviews = await reviewModel.find({ 
        foodId, 
        status: 'approved', 
        isVisible: true 
      });
      
      if (approvedReviews.length > 0) {
        const avgRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length;
        food.rating = Math.round(avgRating * 10) / 10;
        food.totalRatings = approvedReviews.length;
      } else {
        food.rating = 0;
        food.totalRatings = 0;
      }
      await food.save();
    }

    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting review" });
  }
};

// Admin: Get all reviews with filtering
const getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const maxLimit = 100;
    const actualLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * actualLimit;
    
    // Build query for filtering
    const query = {};
    
    // Filter by feedback type (positive/negative) - use sentiment analysis if available
    const feedbackType = req.query.feedbackType; // 'positive', 'negative', or 'all'
    if (feedbackType === 'positive') {
      // Prefer sentiment analysis, fallback to rating
      query.$or = [
        { 'sentiment.label': 'positive' },
        { rating: { $gte: 4 }, 'sentiment.label': { $exists: false } }
      ];
    } else if (feedbackType === 'negative') {
      // Prefer sentiment analysis, fallback to rating
      query.$or = [
        { 'sentiment.label': 'negative' },
        { rating: { $lte: 2 }, 'sentiment.label': { $exists: false } }
      ];
    }
    
    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    // Filter by food item
    if (req.query.foodId) {
      query.foodId = req.query.foodId;
    }
    
    // Filter by visibility
    if (req.query.isVisible !== undefined) {
      query.isVisible = req.query.isVisible === 'true';
    }
    
    const reviews = await reviewModel
      .find(query)
      .populate('foodId', 'name image')
      .populate('orderId', 'orderNumber')
      .sort({ createdAt: -1 })
      .limit(actualLimit)
      .skip(skip)
      .lean();

    await hydrateReviewUserData(reviews);
    
    const total = await reviewModel.countDocuments(query);
    
    // Calculate statistics (using sentiment analysis if available)
    const allReviews = await reviewModel.find({}).select('rating sentiment');
    const positiveCount = allReviews.filter(r => 
      (r.sentiment?.label === 'positive') || (!r.sentiment?.label && r.rating >= 4)
    ).length;
    const negativeCount = allReviews.filter(r => 
      (r.sentiment?.label === 'negative') || (!r.sentiment?.label && r.rating <= 2)
    ).length;
    const neutralCount = allReviews.filter(r => 
      (r.sentiment?.label === 'neutral') || (!r.sentiment?.label && r.rating === 3)
    ).length;
    const avgRating = allReviews.length > 0 
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(2)
      : 0;
    
    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        page,
        limit: actualLimit,
        total,
        totalPages: Math.ceil(total / actualLimit),
        hasNext: page < Math.ceil(total / actualLimit),
        hasPrev: page > 1
      },
      statistics: {
        total: allReviews.length,
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount,
        averageRating: parseFloat(avgRating)
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching reviews" });
  }
};

// Admin: Update review status
const updateReviewStatus = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, isVisible } = req.body;
    
    const review = await reviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    
    if (status) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      review.status = status;
    }
    
    if (isVisible !== undefined) {
      review.isVisible = isVisible;
    }
    
    await review.save();
    
    // Update food item rating when status or visibility changes
    const food = await foodModel.findById(review.foodId);
    if (food) {
      const approvedReviews = await reviewModel.find({ 
        foodId: review.foodId, 
        status: 'approved', 
        isVisible: true 
      });
      
      if (approvedReviews.length > 0) {
        const avgRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length;
        food.rating = Math.round(avgRating * 10) / 10;
        food.totalRatings = approvedReviews.length;
      } else {
        food.rating = 0;
        food.totalRatings = 0;
      }
      await food.save();
    }
    
    res.status(200).json({ 
      success: true, 
      message: "Review status updated successfully",
      data: review
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating review status" });
  }
};

// Admin: Delete review
const adminDeleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    
    const review = await reviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    
    const foodId = review.foodId;
    await reviewModel.findByIdAndDelete(reviewId);
    
    // Update food item rating (only count approved and visible reviews)
    const food = await foodModel.findById(foodId);
    if (food) {
      const approvedReviews = await reviewModel.find({ 
        foodId, 
        status: 'approved', 
        isVisible: true 
      });
      
      if (approvedReviews.length > 0) {
        const avgRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length;
        food.rating = Math.round(avgRating * 10) / 10;
        food.totalRatings = approvedReviews.length;
      } else {
        food.rating = 0;
        food.totalRatings = 0;
      }
      await food.save();
    }
    
    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting review" });
  }
};

export { addReview, getFoodReviews, getOrderReviews, updateReview, deleteReview, getAllReviews, updateReviewStatus, adminDeleteReview };

