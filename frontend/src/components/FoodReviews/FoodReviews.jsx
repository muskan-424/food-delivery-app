import React, { useState, useEffect, useContext } from "react";
import "./FoodReviews.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";

const FoodReviews = ({ foodId }) => {
  const { url } = useContext(StoreContext);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchReviews = async () => {
      if (!foodId) return;
      
      try {
        const response = await axios.get(`${url}/api/review/food/${foodId}?limit=3`);
        if (response.data.success) {
          setReviews(response.data.data || []);
        }
      } catch (error) {
        console.error("Error fetching reviews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [foodId, url]);

  if (loading) {
    return <div className="food-reviews-loading">Loading reviews...</div>;
  }

  if (reviews.length === 0) {
    return null; // Don't show anything if no reviews
  }

  const displayReviews = showAll ? reviews : reviews.slice(0, 2);

  return (
    <div className="food-reviews">
      <h4 className="reviews-title">Customer Reviews</h4>
      <div className="reviews-list">
        {displayReviews.map((review) => {
          const reviewerName = review.userName || review.userId?.name || "Foodie";
          const avatarSource = review.userAvatar || review.userId?.profilePicture || "";
          const avatarUrl = avatarSource
            ? (avatarSource.startsWith("http")
                ? avatarSource
                : `${url}/images/${avatarSource}`)
            : null;

          return (
            <div key={review._id} className="review-item">
              <div className="review-header">
                <div className="reviewer-info">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={reviewerName} className="reviewer-avatar" />
                  ) : (
                    <div className="reviewer-avatar placeholder">
                      {reviewerName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="reviewer-name">{reviewerName}</div>
                    {review.isVerified && (
                      <span className="review-badge">Verified order</span>
                    )}
                  </div>
                </div>
                <div className="review-rating">
                  {"⭐".repeat(review.rating)}
                </div>
              </div>
              {review.comment && (
                <p className="review-comment">{review.comment}</p>
              )}
            </div>
          );
        })}
      </div>
      {reviews.length > 2 && (
        <button 
          className="show-more-reviews"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show Less" : `Show All ${reviews.length} Reviews`}
        </button>
      )}
    </div>
  );
};

export default FoodReviews;

