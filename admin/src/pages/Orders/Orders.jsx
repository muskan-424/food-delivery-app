import React, { useState, useEffect, useContext } from "react";
import "./Orders.css";
import axios from "axios";
import { toast } from "react-toastify";
import { assets } from "../../assets/assets";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate, useLocation } from "react-router-dom";
import { formatCurrency } from "../../utils/currency";

const Orders = ({ url }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, admin } = useContext(StoreContext);
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchAllOrder = async () => {
    const response = await axios.get(url + "/api/order/list", {
      headers: { token },
    });
    if (response.data.success) {
      setOrders(response.data.data);
    }
  };

  const statusHandler = async (event, orderId) => {
    const newStatus = event.target.value;
    const previousStatus = orders.find(o => o._id === orderId)?.status || "";
    
    try {
      const response = await axios.post(
        url + "/api/order/status",
        {
          orderId,
          status: newStatus,
        },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success(response.data.message);
        await fetchAllOrder();
      } else {
        toast.error(response.data.message || "Failed to update status");
        // Revert to previous status
        event.target.value = previousStatus;
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.errors?.[0]?.msg || 
                          "Error updating order status. Please try again.";
      toast.error(errorMessage);
      // Revert the select to previous value on error
      event.target.value = previousStatus;
    }
  };
  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchAllOrder();
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get("status");
    setStatusFilter(statusParam || "all");
  }, [location.search]);

  const handleFilterChange = (value) => {
    setStatusFilter(value);
    const params = new URLSearchParams(location.search);
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    navigate({
      pathname: "/orders",
      search: params.toString() ? `?${params.toString()}` : "",
    }, { replace: true });
  };

  const filteredOrders =
    statusFilter === "all"
      ? orders
      : orders.filter((order) => order.status === statusFilter);

  return (
    <div className="order add">
      <div className="order-header">
        <h3>Order Page</h3>
        <div className="order-filters">
          <label htmlFor="status-filter">Status:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="order-list">
        {filteredOrders.length === 0 ? (
          <p className="no-orders">No orders found for this status.</p>
        ) : (
          filteredOrders.map((order, index) => (
            <div key={index} className="order-item">
              <img src={assets.parcel_icon} alt="" />
              <div>
                <p className="order-item-food">
                  {order.items.map((item, idx) => {
                    if (idx === order.items.length - 1) {
                      return item.name + " x " + item.quantity;
                    } else {
                      return item.name + " x " + item.quantity + ", ";
                    }
                  })}
                </p>
                <p className="order-item-name">
                  {order.address?.name ||
                    (order.address?.firstName && order.address?.lastName
                      ? `${order.address.firstName} ${order.address.lastName}`
                      : "N/A")}
                </p>
                <div className="order-item-address">
                  <p>{order.address?.addressLine1 || order.address?.street || "N/A"}</p>
                  <p>
                    {`${order.address?.city || "N/A"}, ${order.address?.state || "N/A"}, ${
                      order.address?.pincode ||
                      order.address?.zipcode ||
                      order.address?.zipCode ||
                      "N/A"
                    }`}
                  </p>
                </div>
                <p className="order-item-phone">{order.address?.phone || "N/A"}</p>
              </div>
              <p>Items: {order.items.length}</p>
              <p>{formatCurrency(order.amount)}</p>
              <select
                onChange={(event) => statusHandler(event, order._id)}
                value={order.status}
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Orders;
