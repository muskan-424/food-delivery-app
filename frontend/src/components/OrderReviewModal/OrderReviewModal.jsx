import React, { useState, useEffect, useContext } from "react";
import "./OrderReviewModal.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";
import ReviewModal from "../ReviewModal/ReviewModal";
import { formatCurrency } from "../../utils/currency";

const OrderReviewModal = ({ orderId, orderItems, onClose, onSuccess }) => {
  const { url, token } = useContext(StoreContext);
  const [reviews, setReviews] = useState({}); // Map of foodId to review
  const [loading, setLoading] = useState(true);
  const [activeReview, setActiveReview] = useState(null); // { foodId, foodName, reviewId (if exists) }

  useEffect(() => {
    fetchOrderReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fetchOrderReviews = async () => {
    if (!token || !orderId) return;
    
    setLoading(true);
    try {
      const response = await axios.get(
        `${url}/api/review/order/${orderId}`,
        { headers: { token } }
      );

      if (response.data.success) {
        // Use the reviewMap directly from response (it's already an object)
        setReviews(response.data.reviewMap || {});
      }
    } catch (error) {
      console.error("Error fetching order reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewClick = (item) => {
    const existingReview = reviews[item.foodId || item.id];
    setActiveReview({
      foodId: item.foodId || item.id,
      foodName: item.name,
      orderId: orderId,
      reviewId: existingReview?._id || null,
      existingRating: existingReview?.rating || null,
      existingComment: existingReview?.comment || ''
    });
  };

  const handleReviewSuccess = () => {
    fetchOrderReviews(); // Refresh reviews
    if (onSuccess) onSuccess();
  };

  const handleCloseReview = () => {
    setActiveReview(null);
  };

  const getReviewStatus = (item) => {
    const review = reviews[item.foodId || item.id];
    if (!review) return 'not_reviewed';
    if (review.status === 'pending') return 'pending';
    if (review.status === 'approved') return 'reviewed';
    if (review.status === 'rejected') return 'rejected';
    return 'reviewed';
  };

  const getReviewRating = (item) => {
    const review = reviews[item.foodId || item.id];
    return review?.rating || 0;
  };

  if (loading) {
    return (
      <div className="order-review-modal-overlay" onClick={onClose}>
        <div className="order-review-modal" onClick={(e) => e.stopPropagation()}>
          <div className="loading-container">
            <p>Loading reviews...</p>
          </div>
        </div>
      </div>
    );
  }

  if (activeReview) {
    return (
      <ReviewModal
        foodId={activeReview.foodId}
        foodName={activeReview.foodName}
        orderId={activeReview.orderId}
        reviewId={activeReview.reviewId}
        existingRating={activeReview.existingRating}
        existingComment={activeReview.existingComment}
        onClose={handleCloseReview}
        onSuccess={handleReviewSuccess}
      />
    );
  }

  return (
    <div className="order-review-modal-overlay" onClick={onClose}>
      <div className="order-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="order-review-header">
          <h3>Review Your Order Items</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="order-items-list">
          {orderItems && orderItems.length > 0 ? (
            orderItems.map((item, index) => {
              const status = getReviewStatus(item);
              const rating = getReviewRating(item);
              
              return (
                <div key={item.foodId || item.id || index} className="order-item-review-card">
                  <div className="item-info">
                    <div className="item-image">
                      {item.image ? (
                        <img 
                          src={item.image.startsWith('http') ? item.image : `${url}/images/${item.image}`}
                          alt={item.name}
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/80x80?text=No+Image";
                          }}
                        />
                      ) : (
                        <div className="placeholder-image">No Image</div>
                      )}
                    </div>
                    <div className="item-details">
                      <h4>{item.name}</h4>
                      <p>Quantity: {item.quantity}</p>
                      <p className="item-price">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                  </div>
                  
                  <div className="review-status-section">
                    {status === 'reviewed' && (
                      <div className="review-status-badge reviewed">
                        <span>⭐ {rating}/5</span>
                        <span>Reviewed</span>
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="review-status-badge pending">
                        <span>⏳ Pending Approval</span>
                      </div>
                    )}
                    {status === 'rejected' && (
                      <div className="review-status-badge rejected">
                        <span>❌ Rejected</span>
                      </div>
                    )}
                    {status === 'not_reviewed' && (
                      <div className="review-status-badge not-reviewed">
                        <span>Not Reviewed</span>
                      </div>
                    )}
                    
                    <button
                      className={`review-item-btn ${status === 'reviewed' ? 'update' : 'new'}`}
                      onClick={() => handleReviewClick(item)}
                    >
                      {status === 'reviewed' ? '✏️ Update Review' : '⭐ Write Review'}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="no-items">
              <p>No items found in this order.</p>
            </div>
          )}
        </div>
        
        <div className="order-review-footer">
          <button className="close-modal-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderReviewModal;

