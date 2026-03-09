import React, { useContext, useEffect, useState } from "react";
import "./PaymentHistory.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";
import { formatCurrency } from "../../utils/currency";

const PaymentHistory = () => {
  const { token, url } = useContext(StoreContext);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchPayments();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/payment/user`, {
        headers: { token },
      });

      if (response.data.success) {
        setPayments(response.data.data || []);
      } else {
        toast.error(response.data.message || "Failed to load payment history");
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
      if (error.response?.status === 401) {
        toast.error("Please login again");
      } else {
        toast.error("Error loading payment history");
      }
    } finally {
      setLoading(false);
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

  if (!token) {
    return (
      <div className="payment-history-page">
        <div className="payment-history-card">
          <p>Please log in to view your payment history.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="payment-history-page">
        <div className="payment-history-card">
          <p>Loading payment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-history-page">
      <h2>Payment History</h2>

      {payments.length === 0 ? (
        <div className="payment-history-card">
          <p>No payment history found.</p>
        </div>
      ) : (
        <div className="payments-list">
          {payments.map((payment) => (
            <div key={payment._id} className="payment-card">
              <div className="payment-header">
                <div className="payment-info">
                  <h3>Order #{payment.orderNumber}</h3>
                  <p className="payment-date">{formatDate(payment.createdAt)}</p>
                </div>
                <div className="payment-amount">
                  <h3>{formatCurrency(payment.amount)}</h3>
                  <span
                    className="payment-status"
                    style={{ backgroundColor: getStatusColor(payment.status) }}
                  >
                    {payment.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="payment-details">
                <div className="detail-row">
                  <span className="detail-label">Payment Method:</span>
                  <span className="detail-value">
                    {getPaymentMethodLabel(payment.paymentMethod)}
                  </span>
                </div>

                {payment.paymentProvider && (
                  <div className="detail-row">
                    <span className="detail-label">Provider:</span>
                    <span className="detail-value">{payment.paymentProvider}</span>
                  </div>
                )}

                {payment.transactionId && (
                  <div className="detail-row">
                    <span className="detail-label">Transaction ID:</span>
                    <span className="detail-value">{payment.transactionId}</span>
                  </div>
                )}

                {payment.paymentReference && (
                  <div className="detail-row">
                    <span className="detail-label">Reference:</span>
                    <span className="detail-value">{payment.paymentReference}</span>
                  </div>
                )}

                {payment.paidAt && (
                  <div className="detail-row">
                    <span className="detail-label">Paid At:</span>
                    <span className="detail-value">{formatDate(payment.paidAt)}</span>
                  </div>
                )}

                {payment.failureReason && (
                  <div className="detail-row">
                    <span className="detail-label">Failure Reason:</span>
                    <span className="detail-value error">{payment.failureReason}</span>
                  </div>
                )}

                {payment.status === "refunded" && payment.refundDetails && (
                  <div className="refund-details">
                    <div className="detail-row">
                      <span className="detail-label">Refund Amount:</span>
                      <span className="detail-value">
                        {formatCurrency(payment.refundDetails.refundAmount)}
                      </span>
                    </div>
                    {payment.refundDetails.refundReason && (
                      <div className="detail-row">
                        <span className="detail-label">Refund Reason:</span>
                        <span className="detail-value">
                          {payment.refundDetails.refundReason}
                        </span>
                      </div>
                    )}
                    {payment.refundDetails.refundedAt && (
                      <div className="detail-row">
                        <span className="detail-label">Refunded At:</span>
                        <span className="detail-value">
                          {formatDate(payment.refundDetails.refundedAt)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;

