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
  const [scheduledFilter, setScheduledFilter] = useState("all");
  const [dueOnly, setDueOnly] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchAllOrder = async () => {
    const params = {};
    if (statusFilter !== "all") params.status = statusFilter;
    if (scheduledFilter === "scheduled") params.scheduled = "true";
    if (scheduledFilter === "asap") params.scheduled = "false";
    if (dueOnly) params.dueOnly = "true";
    if (fromDate) params.from = `${fromDate}T00:00:00`;
    if (toDate) params.to = `${toDate}T23:59:59`;
    const response = await axios.get(url + "/api/order/list", {
      headers: { token },
      params,
    });
    if (response.data.success) {
      setOrders(response.data.data);
    }
  };

  const formatScheduleMeta = (order) => {
    if (order?.scheduleMeta?.scheduledSlot?.date) {
      const slot = order.scheduleMeta.scheduledSlot;
      return `${slot.date} ${slot.startTime}-${slot.endTime}`;
    }
    if (order?.scheduleMeta?.scheduledFor) {
      return new Date(order.scheduleMeta.scheduledFor).toLocaleString();
    }
    return "ASAP";
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
    const scheduledParam = params.get("scheduled");
    const dueOnlyParam = params.get("dueOnly");
    const fromParam = params.get("from");
    const toParam = params.get("to");
    setStatusFilter(statusParam || "all");
    if (scheduledParam === "true") setScheduledFilter("scheduled");
    else if (scheduledParam === "false") setScheduledFilter("asap");
    else setScheduledFilter("all");
    setDueOnly(dueOnlyParam === "true");
    setFromDate(fromParam ? String(fromParam).slice(0, 10) : "");
    setToDate(toParam ? String(toParam).slice(0, 10) : "");
  }, [location.search]);

  useEffect(() => {
    if (token) {
      fetchAllOrder();
    }
  }, [token, statusFilter, scheduledFilter, dueOnly, fromDate, toDate]);

  const handleFilterChange = (next = {}) => {
    const params = new URLSearchParams(location.search);
    const nextStatus = next.status ?? statusFilter;
    const nextScheduled = next.scheduled ?? scheduledFilter;
    const nextDueOnly = next.dueOnly ?? dueOnly;
    const nextFromDate = next.fromDate ?? fromDate;
    const nextToDate = next.toDate ?? toDate;
    setStatusFilter(nextStatus);
    setScheduledFilter(nextScheduled);
    setDueOnly(nextDueOnly);
    setFromDate(nextFromDate);
    setToDate(nextToDate);

    if (nextStatus === "all") {
      params.delete("status");
    } else {
      params.set("status", nextStatus);
    }
    if (nextScheduled === "scheduled") {
      params.set("scheduled", "true");
    } else if (nextScheduled === "asap") {
      params.set("scheduled", "false");
    } else {
      params.delete("scheduled");
    }
    if (nextDueOnly) {
      params.set("dueOnly", "true");
    } else {
      params.delete("dueOnly");
    }
    if (nextFromDate) {
      params.set("from", `${nextFromDate}T00:00:00`);
    } else {
      params.delete("from");
    }
    if (nextToDate) {
      params.set("to", `${nextToDate}T23:59:59`);
    } else {
      params.delete("to");
    }
    navigate({
      pathname: "/orders",
      search: params.toString() ? `?${params.toString()}` : "",
    }, { replace: true });
  };

  return (
    <div className="order add">
      <div className="order-header">
        <h3>Order Page</h3>
        <div className="order-filters">
          <label htmlFor="status-filter">Status:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => handleFilterChange({ status: e.target.value })}
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
          <label htmlFor="scheduled-filter">Schedule:</label>
          <select
            id="scheduled-filter"
            value={scheduledFilter}
            onChange={(e) => handleFilterChange({ scheduled: e.target.value })}
          >
            <option value="all">All</option>
            <option value="scheduled">Scheduled only</option>
            <option value="asap">ASAP only</option>
          </select>
          <label htmlFor="from-date">From:</label>
          <input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => handleFilterChange({ fromDate: e.target.value })}
          />
          <label htmlFor="to-date">To:</label>
          <input
            id="to-date"
            type="date"
            value={toDate}
            onChange={(e) => handleFilterChange({ toDate: e.target.value })}
          />
          <label className="due-only-filter" htmlFor="due-only-filter">
            <input
              id="due-only-filter"
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => handleFilterChange({ dueOnly: e.target.checked })}
            />
            Due only
          </label>
        </div>
      </div>
      <div className="order-list">
        {orders.length === 0 ? (
          <p className="no-orders">No orders found for this status.</p>
        ) : (
          orders.map((order, index) => (
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
                <p className="order-item-schedule">
                  Schedule: {formatScheduleMeta(order)}
                </p>
                {order?.scheduleMeta?.isScheduleDue ? (
                  <span className="order-schedule-badge due">Due now</span>
                ) : order?.scheduleMeta?.isScheduled ? (
                  <span className="order-schedule-badge scheduled">Scheduled</span>
                ) : (
                  <span className="order-schedule-badge asap">ASAP</span>
                )}
              </div>
              <p>Items: {order.items.length}</p>
              <p>{formatCurrency(order.finalAmount ?? order.amount)}</p>
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
