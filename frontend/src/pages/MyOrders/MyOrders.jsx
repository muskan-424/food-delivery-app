import React, { useContext, useEffect, useState } from "react";
import "./MyOrders.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { assets } from "../../assets/frontend_assets/assets";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import ReviewModal from "../../components/ReviewModal/ReviewModal";
import OrderReviewModal from "../../components/OrderReviewModal/OrderReviewModal";
import { formatCurrency } from "../../utils/currency";

const MyOrders = () => {
  const { url, token } = useContext(StoreContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewModal, setReviewModal] = useState({ show: false, foodId: null, foodName: null, orderId: null });
  const [orderReviewModal, setOrderReviewModal] = useState({ show: false, orderId: null, orderItems: [] });
  const navigate = useNavigate();

  const fetchOrders = async (showLoading = true, silent = false) => {
    if (!token) {
      if (!silent) {
        toast.error("Please login to view your orders");
        navigate("/");
      }
      return;
    }

    if (showLoading) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const response = await axios.post(
        url + "/api/order/userorders",
        {},
        { headers: { token } }
      );
      if (response.data.success) {
        setData(response.data.data || []);
        setLastUpdated(new Date());
        if (!silent && !showLoading) {
          // Only show toast on manual refresh, not auto-refresh
        }
      } else {
        setError(response.data.message || "Failed to fetch orders");
        if (!silent) {
          toast.error(response.data.message || "Failed to fetch orders");
        }
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      const errorMessage = error.response?.data?.message || "Error fetching orders. Please try again.";
      setError(errorMessage);
      if (!silent) {
        toast.error(errorMessage);
      }
      
      // If unauthorized, redirect to login
      if (error.response?.status === 401) {
        navigate("/");
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    if (token) {
      fetchOrders(true, false);
      
      // Set up auto-refresh every 30 seconds
      const refreshInterval = setInterval(() => {
        fetchOrders(false, true); // Silent refresh
      }, 30000); // 30 seconds

      // Clean up interval on unmount
      return () => {
        clearInterval(refreshInterval);
      };
    } else {
      toast.error("Please login to view your orders");
      navigate("/");
    }
  }, [token]);

  // Refresh when page becomes visible (user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && token) {
        fetchOrders(false, true); // Silent refresh when tab becomes visible
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);

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

  const formatStatus = (status) => {
    if (!status) return "Unknown";
    const statusMap = {
      "pending": "Pending",
      "confirmed": "Confirmed",
      "preparing": "Preparing",
      "ready": "Ready",
      "out_for_delivery": "Out for Delivery",
      "delivered": "Delivered",
      "cancelled": "Cancelled",
      "Food Processing": "Food Processing"
    };
    return statusMap[status.toLowerCase()] || status;
  };

  const getStatusColor = (status) => {
    const statusColors = {
      "pending": "#9E9E9E",
      "confirmed": "#4CAF50",
      "preparing": "#FF9800",
      "ready": "#FFC107",
      "out_for_delivery": "#2196F3",
      "delivered": "#4CAF50",
      "cancelled": "#F44336",
      "Food Processing": "#FF9800"
    };
    return statusColors[status?.toLowerCase()] || "#757575";
  };

  if (loading) {
    return (
      <div className="my-orders">
        <h2>My Orders</h2>
        <div className="loading-container">
          <p>Loading your orders...</p>
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="my-orders">
        <h2>My Orders</h2>
        <div className="error-container">
          <p>{error}</p>
          <button onClick={fetchOrders}>Try Again</button>
        </div>
      </div>
    );
  }

  const handleManualRefresh = () => {
    fetchOrders(false, false); // Manual refresh with toast
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return "";
    const now = new Date();
    const diff = Math.floor((now - lastUpdated) / 1000); // seconds
    
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    return lastUpdated.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const canCancelOrder = (order) => {
    const cancellableStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
    return cancellableStatuses.includes(order.status?.toLowerCase());
  };

  const handleCancelOrder = async (orderId, orderNumber) => {
    if (!window.confirm(`Are you sure you want to cancel order #${orderNumber || orderId.slice(-8)}?`)) {
      return;
    }

    try {
      const response = await axios.post(
        url + "/api/order/cancel",
        { orderId },
        { headers: { token } }
      );
      
      if (response.data.success) {
        toast.success(response.data.message || "Order cancelled successfully");
        // Refresh orders list
        await fetchOrders(false, false);
      } else {
        toast.error(response.data.message || "Failed to cancel order");
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
      const errorMessage = error.response?.data?.message || "Error cancelling order. Please try again.";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="my-orders">
      <div className="my-orders-header">
        <h2>My Orders</h2>
        <div className="orders-header-actions">
          {lastUpdated && (
            <span className="last-updated">
              Last updated: {formatLastUpdated()}
            </span>
          )}
          <button 
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="refresh-btn"
            title="Refresh orders"
          >
            <span className={isRefreshing ? "refresh-icon spinning" : "refresh-icon"}>↻</span>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="empty-orders">
          <img src={assets.parcel_icon} alt="No orders" />
          <p>You haven't placed any orders yet.</p>
          <button onClick={() => navigate("/")}>Start Shopping</button>
        </div>
      ) : (
        <div className="container">
          {data.map((order, index) => {
            return (
              <div key={order._id || index} className="my-orders-order">
                <img src={assets.parcel_icon} alt="Order" />
                <div className="order-items">
                  <p>
                    {order.items?.map((item, idx) => {
                      if (idx === order.items.length - 1) {
                        return `${item.name} X ${item.quantity}`;
                      } else {
                        return `${item.name} X ${item.quantity}, `;
                      }
                    }) || "No items"}
                  </p>
                </div>
                <div className="order-amount">
                  <p className="amount-label">Total</p>
                  <p className="amount-value">
                    {formatCurrency(order.finalAmount ?? order.amount ?? 0)}
                  </p>
                </div>
                <div className="order-info">
                  <p className="order-number">Order #{order.orderNumber || order._id?.slice(-8)}</p>
                  <p className="order-date">{formatDate(order.date || order.createdAt)}</p>
                </div>
                <div className="order-status">
                  <span style={{ color: getStatusColor(order.status) }}>&#x25cf;</span>
                  <b style={{ color: getStatusColor(order.status) }}> {formatStatus(order.status)}</b>
                </div>
                <div className="order-actions">
                  {canCancelOrder(order) && (
                    <button 
                      onClick={() => handleCancelOrder(order._id, order.orderNumber)}
                      className="cancel-order-btn"
                      title="Cancel this order"
                    >
                      Cancel Order
                    </button>
                  )}
                  {order.status === 'delivered' && order.items && order.items.length > 0 && (
                    <button 
                      onClick={() => {
                        // Show order review modal with all items
                        setOrderReviewModal({
                          show: true,
                          orderId: order._id,
                          orderItems: order.items || []
                        });
                      }}
                      className="review-order-btn"
                      title="Review all items in this order"
                    >
                      Review Items
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      // Navigate to order tracking or show order details
                      toast.info(`Order ${order.orderNumber || order._id?.slice(-8)} - ${order.status}`);
                    }}
                    className="track-order-btn"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewModal.show && (
        <ReviewModal
          foodId={reviewModal.foodId}
          foodName={reviewModal.foodName}
          orderId={reviewModal.orderId}
          onClose={() => setReviewModal({ show: false, foodId: null, foodName: null, orderId: null })}
          onSuccess={() => {
            // Refresh orders after review submission
            fetchOrders(false, false);
          }}
        />
      )}

      {/* Order Review Modal */}
      {orderReviewModal.show && (
        <OrderReviewModal
          orderId={orderReviewModal.orderId}
          orderItems={orderReviewModal.orderItems}
          onClose={() => setOrderReviewModal({ show: false, orderId: null, orderItems: [] })}
          onSuccess={() => {
            // Refresh orders after review submission
            fetchOrders(false, false);
          }}
        />
      )}
    </div>
  );
};

export default MyOrders;
