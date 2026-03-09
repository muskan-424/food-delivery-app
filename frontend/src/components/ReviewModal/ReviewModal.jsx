import React, { useState, useContext, useEffect } from "react";
import "./ReviewModal.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";

const ReviewModal = ({ foodId, foodName, orderId, reviewId, existingRating, existingComment, onClose, onSuccess }) => {
  const { url, token } = useContext(StoreContext);
  const [rating, setRating] = useState(existingRating || 0);
  const [comment, setComment] = useState(existingComment || "");
  const [submitting, setSubmitting] = useState(false);
  const isEditing = !!reviewId;

  useEffect(() => {
    if (existingRating) setRating(existingRating);
    if (existingComment) setComment(existingComment);
  }, [existingRating, existingComment]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!rating) {
      toast.error("Please select a rating");
      return;
    }

    if (!token) {
      toast.error("Please login to submit a review");
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      let response;
      if (isEditing && reviewId) {
        // Update existing review
        response = await axios.put(
          url + `/api/review/${reviewId}`,
          {
            rating,
            comment: comment.trim()
          },
          { headers: { token } }
        );
      } else {
        // Create new review
        response = await axios.post(
          url + "/api/review",
          {
            foodId,
            orderId,
            rating,
            comment: comment.trim()
          },
          { headers: { token } }
        );
      }

      if (response.data.success) {
        toast.success(isEditing ? "Review updated successfully!" : "Review submitted successfully!");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.error(response.data.message || `Failed to ${isEditing ? 'update' : 'submit'} review`);
      }
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'submitting'} review:`, error);
      if (error.response?.status === 409) {
        const reviewId = error.response.data?.reviewId;
        if (reviewId) {
          toast.info("You have already reviewed this item. Updating your review...");
          // Optionally auto-open in edit mode
        } else {
          toast.info("You have already reviewed this item. You can update your existing review.");
        }
      } else {
        toast.error(`Error ${isEditing ? 'updating' : 'submitting'} review. Please try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="review-modal-overlay" onClick={onClose}>
      <div className="review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="review-modal-header">
          <h3>{isEditing ? 'Update Review' : 'Write a Review'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="review-form">
          <div className="review-food-name">
            <strong>{foodName}</strong>
          </div>

          <div className="rating-section">
            <label>Rating *</label>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star-btn ${star <= rating ? 'active' : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={(e) => {
                    if (!submitting) {
                      const stars = e.target.parentElement.querySelectorAll('.star-btn');
                      stars.forEach((s, i) => {
                        if (i < star) s.classList.add('hover');
                        else s.classList.remove('hover');
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    const stars = document.querySelectorAll('.star-btn');
                    stars.forEach(s => s.classList.remove('hover'));
                  }}
                >
                  ⭐
                </button>
              ))}
              <span className="rating-text">
                {rating === 0 && "Select rating"}
                {rating === 1 && "Poor"}
                {rating === 2 && "Fair"}
                {rating === 3 && "Good"}
                {rating === 4 && "Very Good"}
                {rating === 5 && "Excellent"}
              </span>
            </div>
          </div>

          <div className="comment-section">
            <label htmlFor="comment">Your Review (Optional)</label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this food item..."
              rows="5"
              maxLength={500}
            />
            <span className="char-count">{comment.length}/500</span>
          </div>

          <div className="review-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" disabled={!rating || submitting} className="submit-btn">
              {submitting ? (isEditing ? "Updating..." : "Submitting...") : (isEditing ? "Update Review" : "Submit Review")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReviewModal;

