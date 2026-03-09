import React, { useContext, useEffect, useState } from "react";
import "./Reviews.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";

const Reviews = ({ url }) => {
  const { token } = useContext(StoreContext);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState(null);
  const [filters, setFilters] = useState({
    feedbackType: "all", // 'all', 'positive', 'negative'
    status: "all", // 'all', 'pending', 'approved', 'rejected'
    isVisible: "all" // 'all', 'true', 'false'
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  const fetchReviews = async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.feedbackType !== "all") {
        params.append("feedbackType", filters.feedbackType);
      }
      if (filters.status !== "all") {
        params.append("status", filters.status);
      }
      if (filters.isVisible !== "all") {
        params.append("isVisible", filters.isVisible);
      }
      params.append("page", pagination.page);
      params.append("limit", pagination.limit);

      const response = await axios.get(
        `${url}/api/review/admin/all?${params.toString()}`,
        { headers: { token } }
      );

      if (response.data.success) {
        setReviews(response.data.data || []);
        setStatistics(response.data.statistics);
        setPagination(response.data.pagination);
      } else {
        toast.error(response.data.message || "Failed to fetch reviews");
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast.error("Error fetching reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filters, pagination.page]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handleStatusUpdate = async (reviewId, status, isVisible) => {
    try {
      const response = await axios.put(
        `${url}/api/review/admin/${reviewId}/status`,
        { status, isVisible },
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success("Review status updated");
        await fetchReviews();
      } else {
        toast.error(response.data.message || "Failed to update review");
      }
    } catch (error) {
      console.error("Error updating review:", error);
      toast.error("Error updating review status");
    }
  };

  const handleDelete = async (reviewId) => {
    if (!window.confirm("Are you sure you want to delete this review?")) {
      return;
    }

    try {
      const response = await axios.delete(
        `${url}/api/review/admin/${reviewId}`,
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success("Review deleted successfully");
        await fetchReviews();
      } else {
        toast.error(response.data.message || "Failed to delete review");
      }
    } catch (error) {
      console.error("Error deleting review:", error);
      toast.error("Error deleting review");
    }
  };

  const getRatingColor = (rating, sentiment) => {
    // Use sentiment analysis if available, otherwise fall back to rating
    if (sentiment?.label) {
      if (sentiment.label === 'positive') return "#4CAF50";
      if (sentiment.label === 'negative') return "#F44336";
      return "#FF9800";
    }
    // Fallback to rating-based logic
    if (rating >= 4) return "#4CAF50";
    if (rating <= 2) return "#F44336";
    return "#FF9800";
  };

  const getRatingLabel = (rating, sentiment) => {
    // Use sentiment analysis if available
    if (sentiment?.label) {
      return sentiment.label.charAt(0).toUpperCase() + sentiment.label.slice(1);
    }
    // Fallback to rating-based logic
    if (rating >= 4) return "Positive";
    if (rating <= 2) return "Negative";
    return "Neutral";
  };

  const renderStars = (rating) => {
    return "⭐".repeat(rating) + "☆".repeat(5 - rating);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  if (loading && reviews.length === 0) {
    return (
      <div className="reviews-page">
        <h2>Reviews & Feedback</h2>
        <div className="loading-container">
          <p>Loading reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reviews-page">
      <div className="reviews-header">
        <h2>Reviews & Feedback Management</h2>
        {statistics && (
          <div className="reviews-statistics">
            <div className="stat-card">
              <span className="stat-label">Total</span>
              <span className="stat-value">{statistics.total}</span>
            </div>
            <div className="stat-card positive">
              <span className="stat-label">Positive</span>
              <span className="stat-value">{statistics.positive}</span>
            </div>
            <div className="stat-card negative">
              <span className="stat-label">Negative</span>
              <span className="stat-value">{statistics.negative}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Avg Rating</span>
              <span className="stat-value">{statistics.averageRating.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="reviews-filters">
        <div className="filter-group">
          <label>Feedback Type (AI Detected)</label>
          <select
            value={filters.feedbackType}
            onChange={(e) => handleFilterChange("feedbackType", e.target.value)}
            className="filter-select"
          >
            <option value="all">All Feedback</option>
            <option value="positive">Positive (AI Detected)</option>
            <option value="negative">Negative (AI Detected)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Status</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Visibility</label>
          <select
            value={filters.isVisible}
            onChange={(e) => handleFilterChange("isVisible", e.target.value)}
            className="filter-select"
          >
            <option value="all">All</option>
            <option value="true">Visible</option>
            <option value="false">Hidden</option>
          </select>
        </div>

        <button onClick={() => {
          setFilters({ feedbackType: "all", status: "all", isVisible: "all" });
          setPagination(prev => ({ ...prev, page: 1 }));
        }} className="reset-filters-btn">
          Reset Filters
        </button>
      </div>

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="empty-reviews">
          <p>No reviews found matching the filters.</p>
        </div>
      ) : (
        <>
          <div className="reviews-list">
            {reviews.map((review) => (
              <div key={review._id} className="review-card">
                <div className="review-header">
                  <div className="review-user-info">
                    <div className={`user-avatar ${(review.userAvatar || review.userId?.profilePicture) ? "has-image" : "placeholder"}`}>
                      {review.userAvatar || review.userId?.profilePicture ? (
                        <img
                          src={
                            (review.userAvatar || review.userId?.profilePicture || "").startsWith("http")
                              ? (review.userAvatar || review.userId?.profilePicture)
                              : `${url}/images/${review.userAvatar || review.userId?.profilePicture}`
                          }
                          alt={review.userName || review.userId?.name || "User"}
                        />
                      ) : (
                        (review.userName || review.userId?.name || "U").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="user-name">{review.userName || review.userId?.name || "Anonymous"}</p>
                      <p className="review-date">{formatDate(review.createdAt)}</p>
                    </div>
                  </div>
                  <div className="review-rating">
                    <span
                      className="rating-badge"
                      style={{ backgroundColor: getRatingColor(review.rating, review.sentiment) }}
                    >
                      {renderStars(review.rating)} ({getRatingLabel(review.rating, review.sentiment)})
                    </span>
                    {review.sentiment && (
                      <div className="sentiment-info">
                        <span className="sentiment-badge" title={`Confidence: ${review.sentiment.confidence}%`}>
                          🤖 AI: {review.sentiment.label}
                          {review.sentiment.confidence > 0 && (
                            <span className="confidence-score">{review.sentiment.confidence}%</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="review-content">
                  <div className="review-food-info">
                    <strong>Food Item:</strong> {review.foodId?.name || "N/A"}
                    {review.orderId && (
                      <span className="order-ref">Order: #{review.orderId?.orderNumber || "N/A"}</span>
                    )}
                    {review.isVerified && (
                      <span className="verified-badge">✓ Verified Purchase</span>
                    )}
                    {review.sentiment && review.status === 'approved' && review.sentiment.label === 'positive' && review.sentiment.confidence > 80 && (
                      <span className="auto-approved-badge" title="Auto-approved by AI sentiment analysis">
                        ✨ Auto-Approved
                      </span>
                    )}
                  </div>
                  {review.comment && (
                    <p className="review-comment">{review.comment}</p>
                  )}
                  {review.sentiment && review.sentiment.confidence > 0 && (
                    <div className="sentiment-details">
                      <small>
                        Sentiment Analysis: <strong>{review.sentiment.label}</strong> 
                        {review.sentiment.confidence > 0 && ` (${review.sentiment.confidence}% confidence)`}
                        {review.sentiment.score !== 0 && ` | Score: ${review.sentiment.score > 0 ? '+' : ''}${review.sentiment.score.toFixed(2)}`}
                      </small>
                    </div>
                  )}
                </div>

                <div className="review-footer">
                  <div className="review-status">
                    <span className={`status-badge status-${review.status}`}>
                      {review.status}
                    </span>
                    <span className={`visibility-badge ${review.isVisible ? 'visible' : 'hidden'}`}>
                      {review.isVisible ? "👁️ Visible" : "🚫 Hidden"}
                    </span>
                  </div>
                  <div className="review-actions">
                    <select
                      value={review.status}
                      onChange={(e) => handleStatusUpdate(review._id, e.target.value, review.isVisible)}
                      className="status-select"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <button
                      onClick={() => handleStatusUpdate(review._id, review.status, !review.isVisible)}
                      className={`visibility-btn ${review.isVisible ? 'hide' : 'show'}`}
                    >
                      {review.isVisible ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={() => handleDelete(review._id)}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="pagination-btn"
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="pagination-btn"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Reviews;

