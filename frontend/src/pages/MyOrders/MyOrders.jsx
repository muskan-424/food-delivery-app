import React, { useContext, useEffect, useState } from "react";
import "./MyOrders.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { assets } from "../../assets/frontend_assets/assets";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import ReviewModal from "../../components/ReviewModal/ReviewModal";
import OrderReviewModal from "../../components/OrderReviewModal/OrderReviewModal";
import OpenDisputeModal from "../../components/OpenDisputeModal/OpenDisputeModal";
import { formatCurrency } from "../../utils/currency";

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector("script[data-razorpay-checkout]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.setAttribute("data-razorpay-checkout", "1");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Razorpay script failed to load"));
    document.body.appendChild(s);
  });
}

function formatRetrySeconds(data) {
  const sec = Number(data?.retryAfterSeconds);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.max(1, Math.ceil(sec));
}

function buildRazorpayRetryMessage(data) {
  const retryIn = formatRetrySeconds(data);
  const attempts = Number(data?.attemptsInWindow);
  const maxAttempts = Number(data?.maxAttemptsPerHour);
  const attemptsKnown =
    Number.isFinite(attempts) &&
    attempts >= 0 &&
    Number.isFinite(maxAttempts) &&
    maxAttempts > 0;
  if (retryIn && attemptsKnown) {
    const left = Math.max(0, Math.floor(maxAttempts - attempts));
    return `Please wait ${retryIn}s before retrying payment. Attempts left this hour: ${left}/${Math.floor(
      maxAttempts
    )}.`;
  }
  if (retryIn) {
    return `Please wait ${retryIn}s before retrying payment.`;
  }
  if (attemptsKnown) {
    const left = Math.max(0, Math.floor(maxAttempts - attempts));
    return `Too many payment retries. Attempts left this hour: ${left}/${Math.floor(
      maxAttempts
    )}.`;
  }
  return null;
}

function extractRetryAttemptsMeta(data) {
  const attempts = Number(data?.attemptsInWindow);
  const maxAttempts = Number(data?.maxAttemptsPerHour);
  if (!Number.isFinite(attempts) || !Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    return null;
  }
  return {
    attemptsLeft: Math.max(0, Math.floor(maxAttempts - attempts)),
    maxAttempts: Math.floor(maxAttempts),
  };
}

const MyOrders = () => {
  const { url, token } = useContext(StoreContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [retryCooldownByOrder, setRetryCooldownByOrder] = useState({});
  const [retryAttemptsMetaByOrder, setRetryAttemptsMetaByOrder] = useState({});
  const [reviewModal, setReviewModal] = useState({ show: false, foodId: null, foodName: null, orderId: null });
  const [orderReviewModal, setOrderReviewModal] = useState({ show: false, orderId: null, orderItems: [] });
  const [disputeModalOrder, setDisputeModalOrder] = useState(null);
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

  useEffect(() => {
    const active = Object.values(retryCooldownByOrder).some((v) => Number(v) > 0);
    if (!active) return undefined;
    const timer = setInterval(() => {
      setRetryCooldownByOrder((prev) => {
        const next = {};
        let hasNext = false;
        for (const [orderId, sec] of Object.entries(prev)) {
          const n = Math.max(0, Number(sec || 0) - 1);
          if (n > 0) {
            next[orderId] = n;
            hasNext = true;
          }
        }
        return hasNext ? next : {};
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCooldownByOrder]);

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

  const formatScheduleLine = (order) => {
    if (order?.scheduledSlot?.date && order?.scheduledSlot?.startTime && order?.scheduledSlot?.endTime) {
      const slotDate = new Date(`${order.scheduledSlot.date}T00:00:00`);
      const dateLabel = slotDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `Scheduled: ${dateLabel}, ${order.scheduledSlot.startTime} - ${order.scheduledSlot.endTime}`;
    }
    if (order?.scheduledFor) {
      return `Scheduled: ${formatDate(order.scheduledFor)}`;
    }
    return "Delivery: ASAP";
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

  const canOpenDispute = (order) => {
    const s = order?.status?.toLowerCase();
    return s && s !== "cancelled";
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

  const canRetryRazorpayPayment = (order) => {
    return (
      order?.payment?.method === "razorpay" &&
      order?.payment?.status !== "paid" &&
      order?.status !== "cancelled" &&
      order?.status !== "delivered"
    );
  };

  const showRazorpayPaymentBadge = (order) => {
    return order?.payment?.method === "razorpay" && order?.payment?.status !== "paid";
  };

  const handlePayNow = async (order) => {
    try {
      setPayingOrderId(order._id);
      await loadRazorpayScript();
      const cr = await axios.post(
        url + "/api/payment/razorpay/create-order",
        { orderId: order._id },
        { headers: { token } }
      );
      if (!cr.data?.success) {
        toast.error(cr.data?.message || "Could not start payment");
        setPayingOrderId(null);
        return;
      }
      const { keyId, razorpayOrderId, amountPaise, orderNumber } = cr.data;
      const checkoutRetryMeta = extractRetryAttemptsMeta(cr.data?.checkoutRetry);
      if (checkoutRetryMeta) {
        setRetryAttemptsMetaByOrder((prev) => ({
          ...prev,
          [order._id]: checkoutRetryMeta,
        }));
      }
      const options = {
        key: keyId,
        amount: amountPaise,
        currency: "INR",
        name: "Food delivery",
        description: orderNumber ? `Order ${orderNumber}` : "Order payment",
        order_id: razorpayOrderId,
        handler: async (rzResponse) => {
          try {
            await axios.post(
              url + "/api/payment/razorpay/verify",
              {
                orderId: order._id,
                razorpay_order_id: rzResponse.razorpay_order_id,
                razorpay_payment_id: rzResponse.razorpay_payment_id,
                razorpay_signature: rzResponse.razorpay_signature,
              },
              { headers: { token } }
            );
            toast.success("Payment successful");
            setRetryAttemptsMetaByOrder((prev) => {
              const next = { ...prev };
              delete next[order._id];
              return next;
            });
            await fetchOrders(false, false);
          } catch (err) {
            toast.error(err.response?.data?.message || "Payment verification failed");
          } finally {
            setPayingOrderId(null);
          }
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment window closed");
            setPayingOrderId(null);
          },
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (ev) => {
        toast.error(ev?.error?.description || ev?.error?.reason || "Payment failed");
        setPayingOrderId(null);
      });
      rzp.open();
    } catch (error) {
      console.error("Razorpay retry failed:", error);
      const retryIn = formatRetrySeconds(error.response?.data);
      const retryMsg = buildRazorpayRetryMessage(error.response?.data);
      if (error.response?.status === 429 && retryMsg) {
        const retryMeta = extractRetryAttemptsMeta(error.response?.data);
        if (retryMeta) {
          setRetryAttemptsMetaByOrder((prev) => ({
            ...prev,
            [order._id]: retryMeta,
          }));
        }
        if (retryIn) {
          setRetryCooldownByOrder((prev) => ({ ...prev, [order._id]: retryIn }));
        }
        toast.info(retryMsg);
        setPayingOrderId(null);
        return;
      }
      toast.error(error.response?.data?.message || "Could not start Razorpay checkout");
      setPayingOrderId(null);
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
                  <p className="order-schedule">{formatScheduleLine(order)}</p>
                </div>
                <div className="order-status">
                  <div className="order-status-row">
                    <span style={{ color: getStatusColor(order.status) }}>&#x25cf;</span>
                    <b style={{ color: getStatusColor(order.status) }}> {formatStatus(order.status)}</b>
                  </div>
                  {showRazorpayPaymentBadge(order) && (
                    <span
                      className={
                        order?.status === "cancelled"
                          ? "order-payment-badge order-payment-badge--muted"
                          : "order-payment-badge"
                      }
                      title={
                        order?.status === "cancelled"
                          ? "Razorpay payment was not completed"
                          : "Complete payment to confirm your order"
                      }
                    >
                      {order?.status === "cancelled" ? "Payment unpaid" : "Payment pending"}
                    </span>
                  )}
                </div>
                <div className="order-actions">
                  {canRetryRazorpayPayment(order) && (
                    <>
                      <button
                        onClick={() => handlePayNow(order)}
                        className="pay-now-btn"
                        disabled={payingOrderId === order._id || Number(retryCooldownByOrder[order._id] || 0) > 0}
                        title="Complete payment now"
                      >
                        {payingOrderId === order._id
                          ? "Opening..."
                          : Number(retryCooldownByOrder[order._id] || 0) > 0
                            ? `Retry in ${retryCooldownByOrder[order._id]}s`
                            : "Pay Now"}
                      </button>
                      {retryAttemptsMetaByOrder[order._id] && (
                        <p className="payment-retry-meta">
                          Attempts left this hour: {retryAttemptsMetaByOrder[order._id].attemptsLeft}/
                          {retryAttemptsMetaByOrder[order._id].maxAttempts}
                        </p>
                      )}
                    </>
                  )}
                  {canCancelOrder(order) && (
                    <button 
                      onClick={() => handleCancelOrder(order._id, order.orderNumber)}
                      className="cancel-order-btn"
                      title="Cancel this order"
                    >
                      Cancel Order
                    </button>
                  )}
                  {canOpenDispute(order) && (
                    <button
                      type="button"
                      onClick={() => setDisputeModalOrder(order)}
                      className="dispute-order-btn"
                      title="Report a problem with this order"
                    >
                      Report problem
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
      {disputeModalOrder && (
        <OpenDisputeModal
          order={disputeModalOrder}
          onClose={() => setDisputeModalOrder(null)}
          onSuccess={() => fetchOrders(false, true)}
        />
      )}
    </div>
  );
};

export default MyOrders;
