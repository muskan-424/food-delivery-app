import React, { useState, useEffect, useContext } from "react";
import "./Dashboard.css";
import axios from "axios";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { assets } from "../../assets/assets";
import { formatCurrency } from "../../utils/currency";

const Dashboard = ({ url }) => {
  const navigate = useNavigate();
  const { token, admin } = useContext(StoreContext);
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    preparingOrders: 0,
    outForDelivery: 0,
    deliveredOrders: 0,
    totalRevenue: 0,
    totalFoodItems: 0
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchDashboardData();
    }
  }, [token, admin]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch orders
      const ordersResponse = await axios.get(url + "/api/order/list", {
        headers: { token }
      });

      // Fetch food items
      const foodResponse = await axios.get(url + "/api/food/list");

      if (ordersResponse.data.success && foodResponse.data.success) {
        const orders = ordersResponse.data.data || [];
        const foodItems = foodResponse.data.data || [];

        // Calculate statistics
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
        const preparingOrders = orders.filter(o => o.status === 'preparing').length;
        const outForDelivery = orders.filter(o => o.status === 'out_for_delivery').length;
        const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
        
        const totalRevenue = orders
          .filter(o => o.status === 'delivered')
          .reduce((sum, order) => sum + (order.finalAmount || order.amount || 0), 0);

        setStats({
          totalOrders,
          pendingOrders,
          preparingOrders,
          outForDelivery,
          deliveredOrders,
          totalRevenue,
          totalFoodItems: foodItems.length
        });

        // Get recent 5 orders
        const recent = orders
          .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
          .slice(0, 5);
        setRecentOrders(recent);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Error loading dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const formatStatus = (status) => {
    const statusMap = {
      "pending": "Pending",
      "confirmed": "Confirmed",
      "preparing": "Preparing",
      "ready": "Ready",
      "out_for_delivery": "Out for Delivery",
      "delivered": "Delivered",
      "cancelled": "Cancelled"
    };
    return statusMap[status?.toLowerCase()] || status || "Unknown";
  };

  const getStatusColor = (status) => {
    const colors = {
      "pending": "#9E9E9E",
      "confirmed": "#4CAF50",
      "preparing": "#FF9800",
      "ready": "#FFC107",
      "out_for_delivery": "#2196F3",
      "delivered": "#4CAF50",
      "cancelled": "#F44336"
    };
    return colors[status?.toLowerCase()] || "#757575";
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Admin Dashboard</h2>
        <p>Welcome back! Here's an overview of your food delivery system.</p>
      </div>

      <div className="dashboard-stats">
        {[
          {
            label: "Total Orders",
            value: stats.totalOrders,
            color: "#2196F3",
            route: "/orders",
          },
          {
            label: "Pending Orders",
            value: stats.pendingOrders,
            color: "#FF9800",
            route: "/orders?status=pending",
          },
          {
            label: "Out for Delivery",
            value: stats.outForDelivery,
            color: "#2196F3",
            route: "/orders?status=out_for_delivery",
          },
          {
            label: "Delivered",
            value: stats.deliveredOrders,
            color: "#4CAF50",
            route: "/orders?status=delivered",
          },
          {
            label: "Total Revenue",
            value: formatCurrency(stats.totalRevenue),
            color: "#9C27B0",
            route: "/orders?status=delivered",
          },
          {
            label: "Food Items",
            value: stats.totalFoodItems,
            color: "#F44336",
            route: "/list",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`stat-card ${card.route ? "clickable" : ""}`}
            role={card.route ? "button" : "presentation"}
            tabIndex={card.route ? 0 : -1}
            onClick={() => card.route && navigate(card.route)}
            onKeyDown={(e) => {
              if (!card.route) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(card.route);
              }
            }}
          >
            <div className="stat-icon" style={{ backgroundColor: card.color }}>
              <img src={assets.parcel_icon} alt={card.label} />
            </div>
            <div className="stat-info">
              <h3>{card.value}</h3>
              <p>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-content">
        <div className="dashboard-section">
          <div className="section-header">
            <h3>Recent Orders</h3>
            <button onClick={() => navigate("/orders")} className="view-all-btn">
              View All Orders
            </button>
          </div>
          <div className="recent-orders-list">
            {recentOrders.length === 0 ? (
              <p className="no-orders">No orders yet</p>
            ) : (
              recentOrders.map((order, index) => (
                <div key={order._id || index} className="recent-order-item">
                  <div className="order-info-left">
                    <p className="order-number">
                      Order #{order.orderNumber || order._id?.slice(-8)}
                    </p>
                    <p className="order-items">
                      {order.items?.map((item, idx) => 
                        `${item.name} x${item.quantity}`
                      ).join(", ") || "No items"}
                    </p>
                    <p className="order-customer">
                      {order.address?.name || 
                        (order.address?.firstName && order.address?.lastName
                          ? `${order.address.firstName} ${order.address.lastName}`
                          : "Unknown Customer")}
                    </p>
                  </div>
                  <div className="order-info-right">
                    <p className="order-amount">
                      {formatCurrency(order.finalAmount ?? order.amount ?? 0)}
                    </p>
                    <span 
                      className="order-status-badge"
                      style={{ backgroundColor: getStatusColor(order.status) }}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="quick-actions">
            <button 
              className="action-btn"
              onClick={() => navigate("/add")}
            >
              <img src={assets.parcel_icon} alt="Add" />
              <span>Add Food Item</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => navigate("/list")}
            >
              <img src={assets.parcel_icon} alt="List" />
              <span>View All Items</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => navigate("/orders")}
            >
              <img src={assets.parcel_icon} alt="Orders" />
              <span>Manage Orders</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

