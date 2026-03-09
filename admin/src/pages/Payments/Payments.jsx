import React, { useContext, useEffect, useState } from "react";
import "./Payments.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate, useLocation } from "react-router-dom";
import { formatCurrency } from "../../utils/currency";
import { assets } from "../../assets/assets";

const Payments = ({ url }) => {
  const { token, admin } = useContext(StoreContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  const [filters, setFilters] = useState({
    status: "all",
    paymentMethod: "all",
    orderNumber: "",
    transactionId: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    if (!token || !admin) {
      navigate("/");
    } else {
      fetchPayments();
    }
  }, [token, admin, filters, pagination.page]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.paymentMethod !== "all") params.append("paymentMethod", filters.paymentMethod);
      if (filters.orderNumber) params.append("orderNumber", filters.orderNumber);
      if (filters.transactionId) params.append("transactionId", filters.transactionId);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      
      params.append("page", pagination.page);
      params.append("limit", pagination.limit);

      const response = await axios.get(
        `${url}/api/payment/admin/all?${params.toString()}`,
        { headers: { token } }
      );

      if (response.data.success) {
        setPayments(response.data.data || []);
        setStatistics(response.data.statistics || null);
        setPagination((prev) => ({
          ...prev,
          total: response.data.pagination?.total || 0,
          totalPages: response.data.pagination?.totalPages || 0,
        }));
      } else {
        toast.error(response.data.message || "Failed to fetch payments");
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/");
      } else {
        toast.error("Error fetching payments");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleStatusUpdate = async (paymentId, newStatus) => {
    try {
      const response = await axios.put(
        `${url}/api/payment/admin/${paymentId}/status`,
        { status: newStatus },
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success("Payment status updated");
        fetchPayments();
      } else {
        toast.error(response.data.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Error updating payment status:", error);
      toast.error("Error updating payment status");
    }
  };

  const handleRefund = async (paymentId) => {
    const refundAmount = prompt("Enter refund amount (leave empty for full refund):");
    if (refundAmount === null) return;

    const refundReason = prompt("Enter refund reason:");
    if (refundReason === null) return;

    try {
      const response = await axios.post(
        `${url}/api/payment/admin/${paymentId}/refund`,
        {
          refundAmount: refundAmount ? parseFloat(refundAmount) : null,
          refundReason: refundReason || "",
        },
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success("Refund processed successfully");
        fetchPayments();
      } else {
        toast.error(response.data.message || "Failed to process refund");
      }
    } catch (error) {
      console.error("Error processing refund:", error);
      toast.error("Error processing refund");
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      success: "#4CAF50",
      failed: "#F44336",
      pending: "#FF9800",
      processing: "#2196F3",
      refunded: "#9C27B0",
      cancelled: "#757575",
    };
    return colors[status] || "#757575";
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      upi: "UPI",
      netbanking: "Net Banking",
      credit_card: "Credit Card",
      debit_card: "Debit Card",
      wallet: "Wallet",
      cash_on_delivery: "Cash on Delivery",
      other: "Other",
    };
    return labels[method] || method;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading && payments.length === 0) {
    return (
      <div className="payments-page">
        <div className="payments-loading">Loading payments...</div>
      </div>
    );
  }

  return (
    <div className="payments-page">
      <div className="payments-header">
        <h2>Payment Management</h2>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="payments-statistics">
          <div className="stat-card">
            <h3>Total Payments</h3>
            <p>{statistics.total}</p>
          </div>
          <div className="stat-card">
            <h3>Total Revenue</h3>
            <p>{formatCurrency(statistics.totalAmount)}</p>
          </div>
          <div className="stat-card success">
            <h3>Successful</h3>
            <p>{statistics.success}</p>
          </div>
          <div className="stat-card failed">
            <h3>Failed</h3>
            <p>{statistics.failed}</p>
          </div>
          <div className="stat-card pending">
            <h3>Pending</h3>
            <p>{statistics.pending}</p>
          </div>
          <div className="stat-card refunded">
            <h3>Refunded</h3>
            <p>{statistics.refunded}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="payments-filters">
        <div className="filter-group">
          <label>Status</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Payment Method</label>
          <select
            value={filters.paymentMethod}
            onChange={(e) => handleFilterChange("paymentMethod", e.target.value)}
          >
            <option value="all">All Methods</option>
            <option value="upi">UPI</option>
            <option value="netbanking">Net Banking</option>
            <option value="credit_card">Credit Card</option>
            <option value="debit_card">Debit Card</option>
            <option value="wallet">Wallet</option>
            <option value="cash_on_delivery">Cash on Delivery</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Order Number</label>
          <input
            type="text"
            placeholder="Search by order number"
            value={filters.orderNumber}
            onChange={(e) => handleFilterChange("orderNumber", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Transaction ID</label>
          <input
            type="text"
            placeholder="Search by transaction ID"
            value={filters.transactionId}
            onChange={(e) => handleFilterChange("transactionId", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
          />
        </div>

        <button
          onClick={() => {
            setFilters({
              status: "all",
              paymentMethod: "all",
              orderNumber: "",
              transactionId: "",
              startDate: "",
              endDate: "",
            });
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          className="reset-filters-btn"
        >
          Reset Filters
        </button>
      </div>

      {/* Payments List */}
      {payments.length === 0 ? (
        <div className="no-payments">
          <p>No payments found matching the filters.</p>
        </div>
      ) : (
        <>
          <div className="payments-list">
            <table className="payments-table">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Amount</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th>Transaction ID</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment._id}>
                    <td>
                      <strong>{payment.orderNumber}</strong>
                    </td>
                    <td>{formatCurrency(payment.amount)}</td>
                    <td>{getPaymentMethodLabel(payment.paymentMethod)}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(payment.status) }}
                      >
                        {payment.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {payment.transactionId || (
                        <span className="no-transaction">N/A</span>
                      )}
                    </td>
                    <td>{formatDate(payment.createdAt)}</td>
                    <td>
                      <div className="payment-actions">
                        {payment.status === "success" && (
                          <button
                            className="refund-btn"
                            onClick={() => handleRefund(payment._id)}
                          >
                            Refund
                          </button>
                        )}
                        {payment.status !== "success" && payment.status !== "refunded" && (
                          <select
                            className="status-select"
                            value={payment.status}
                            onChange={(e) =>
                              handleStatusUpdate(payment._id, e.target.value)
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="success">Success</option>
                            <option value="failed">Failed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                }
                disabled={pagination.page === 1}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                }
                disabled={pagination.page >= pagination.totalPages}
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

export default Payments;

