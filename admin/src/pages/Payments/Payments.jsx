import React, { useContext, useEffect, useState } from "react";
import "./Payments.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate, useLocation } from "react-router-dom";
import { formatCurrency } from "../../utils/currency";

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
  const [reconciliation, setReconciliation] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconExporting, setReconExporting] = useState(false);
  const [reconIssuesExporting, setReconIssuesExporting] = useState(false);
  const [reconExtended, setReconExtended] = useState(false);
  const [reconFilters, setReconFilters] = useState({
    from: "",
    to: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reconFrom = params.get("reconFrom") || "";
    const reconTo = params.get("reconTo") || "";
    const extendedUrl = params.get("reconExtended") === "1";
    setReconFilters((prev) => ({
      ...prev,
      from: reconFrom,
      to: reconTo,
    }));
    setReconExtended(extendedUrl);
    if (token && admin && reconFrom && reconTo) {
      fetchReconciliation({
        from: reconFrom,
        to: reconTo,
        extended: extendedUrl,
      });
    } else if (token && admin && (reconFrom || reconTo)) {
      fetchReconciliation({
        from: reconFrom,
        to: reconTo,
        extended: false,
      });
    } else if (token && admin) {
      fetchReconciliation({ extended: false });
    }
  }, [location.search, token, admin]);

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

  const fetchReconciliation = async (overrideFilters = null) => {
    try {
      setReconLoading(true);
      const activeFilters = overrideFilters || reconFilters;
      const useExtended =
        overrideFilters && Object.prototype.hasOwnProperty.call(overrideFilters, "extended")
          ? overrideFilters.extended
          : reconExtended;
      const params = new URLSearchParams();
      if (activeFilters.from) params.append("from", `${activeFilters.from}T00:00:00`);
      if (activeFilters.to) params.append("to", `${activeFilters.to}T23:59:59`);
      if (useExtended && activeFilters.from && activeFilters.to) {
        params.append("extended", "1");
      }
      const response = await axios.get(
        `${url}/api/payment/admin/reconciliation/daily?${params.toString()}`,
        { headers: { token } }
      );
      if (response.data.success) {
        setReconciliation(response.data.data || null);
      }
    } catch (error) {
      console.error("Error loading reconciliation:", error);
      toast.error(
        error.response?.data?.message || "Error loading reconciliation report"
      );
    } finally {
      setReconLoading(false);
    }
  };

  const copyReconciliationLink = async () => {
    try {
      const current = new URL(window.location.href);
      if (reconFilters.from) current.searchParams.set("reconFrom", reconFilters.from);
      else current.searchParams.delete("reconFrom");
      if (reconFilters.to) current.searchParams.set("reconTo", reconFilters.to);
      else current.searchParams.delete("reconTo");
      if (reconExtended) current.searchParams.set("reconExtended", "1");
      else current.searchParams.delete("reconExtended");
      await navigator.clipboard.writeText(current.toString());
      toast.success("Report link copied");
    } catch (error) {
      console.error("Error copying report link:", error);
      toast.error("Could not copy report link");
    }
  };

  const exportReconciliationCsv = async () => {
    try {
      setReconExporting(true);
      const params = new URLSearchParams();
      if (reconFilters.from) params.append("from", `${reconFilters.from}T00:00:00`);
      if (reconFilters.to) params.append("to", `${reconFilters.to}T23:59:59`);
      const response = await axios.get(
        `${url}/api/payment/admin/reconciliation/daily.csv?${params.toString()}`,
        { headers: { token }, responseType: "blob" }
      );
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const fromTag = reconFilters.from || "all";
      const toTag = reconFilters.to || "all";
      const filename = `payment-reconciliation-${fromTag}_to_${toTag}.csv`;
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Reconciliation CSV exported");
    } catch (error) {
      console.error("Error exporting reconciliation CSV:", error);
      toast.error(
        error.response?.data?.message || "Error exporting reconciliation CSV"
      );
    } finally {
      setReconExporting(false);
    }
  };

  const exportReconciliationIssuesCsv = async () => {
    if (!reconFilters.from || !reconFilters.to) {
      toast.error("Set both From and To dates to export reconciliation issues");
      return;
    }
    try {
      setReconIssuesExporting(true);
      const params = new URLSearchParams();
      params.append("from", `${reconFilters.from}T00:00:00`);
      params.append("to", `${reconFilters.to}T23:59:59`);
      const response = await axios.get(
        `${url}/api/payment/admin/reconciliation/issues.csv?${params.toString()}`,
        { headers: { token }, responseType: "blob" }
      );
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const fromTag = reconFilters.from;
      const toTag = reconFilters.to;
      const filename = `payment-reconciliation-issues-${fromTag}_to_${toTag}.csv`;
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Issues CSV exported");
    } catch (error) {
      console.error("Error exporting issues CSV:", error);
      toast.error(
        error.response?.data?.message || "Error exporting reconciliation issues CSV"
      );
    } finally {
      setReconIssuesExporting(false);
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
      razorpay: "Razorpay",
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

  const renderReconSampleTable = (title, section, columns, renderRow) => {
    if (!section) return null;
    const samples = section.samples || [];
    const count = section.count ?? 0;
    const capped = count > samples.length;
    return (
      <div className="reconciliation-table-wrap recon-sample-block">
        <h5>
          {title}{" "}
          <span className="recon-sample-meta">
            ({count} total
            {capped ? `, showing ${samples.length}` : ""})
          </span>
        </h5>
        {samples.length === 0 ? (
          <p className="recon-no-rows">None.</p>
        ) : (
          <table className="payments-table reconciliation-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map((r, i) => (
                <tr key={i}>
                  {renderRow(r).map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
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

      {/* Reconciliation */}
      <div className="reconciliation-section">
        <div className="reconciliation-header">
          <h3>Daily Reconciliation</h3>
          <div className="reconciliation-filters">
            <div className="filter-group">
              <label>From</label>
              <input
                type="date"
                value={reconFilters.from}
                onChange={(e) =>
                  setReconFilters((prev) => ({ ...prev, from: e.target.value }))
                }
              />
            </div>
            <div className="filter-group">
              <label>To</label>
              <input
                type="date"
                value={reconFilters.to}
                onChange={(e) =>
                  setReconFilters((prev) => ({ ...prev, to: e.target.value }))
                }
              />
            </div>
            <label className="recon-extended-toggle">
              <input
                type="checkbox"
                checked={reconExtended}
                onChange={(e) => setReconExtended(e.target.checked)}
                disabled={!reconFilters.from || !reconFilters.to}
              />
              <span>Extended (webhooks &amp; drift)</span>
            </label>
            <button
              className="reconciliation-load-btn"
              onClick={() => {
                const params = new URLSearchParams(location.search);
                if (reconFilters.from) params.set("reconFrom", reconFilters.from);
                else params.delete("reconFrom");
                if (reconFilters.to) params.set("reconTo", reconFilters.to);
                else params.delete("reconTo");
                if (reconExtended && reconFilters.from && reconFilters.to) {
                  params.set("reconExtended", "1");
                } else {
                  params.delete("reconExtended");
                }
                navigate(
                  {
                    pathname: "/payments",
                    search: params.toString() ? `?${params.toString()}` : "",
                  },
                  { replace: true }
                );
                fetchReconciliation();
              }}
              disabled={reconLoading}
            >
              {reconLoading ? "Loading..." : "Load"}
            </button>
            <button
              className="reconciliation-export-btn"
              onClick={exportReconciliationCsv}
              disabled={reconExporting}
            >
              {reconExporting ? "Exporting..." : "Export CSV"}
            </button>
            <button
              type="button"
              className="reconciliation-export-btn recon-issues-btn"
              onClick={exportReconciliationIssuesCsv}
              disabled={reconIssuesExporting || !reconFilters.from || !reconFilters.to}
              title="Requires From and To dates"
            >
              {reconIssuesExporting ? "Exporting..." : "Export issues CSV"}
            </button>
            <button
              className="reconciliation-link-btn"
              onClick={copyReconciliationLink}
              type="button"
            >
              Copy Report Link
            </button>
          </div>
        </div>

        {reconciliation && (
          <>
            <div className="reconciliation-summary">
              <div className="stat-card">
                <h3>Total Txns</h3>
                <p>{reconciliation.totals?.totalCount || 0}</p>
              </div>
              <div className="stat-card success">
                <h3>Success Amount</h3>
                <p>{formatCurrency(reconciliation.totals?.successAmount || 0)}</p>
              </div>
              <div className="stat-card refunded">
                <h3>Refunded Amount</h3>
                <p>{formatCurrency(reconciliation.totals?.refundedAmount || 0)}</p>
              </div>
              <div className="stat-card">
                <h3>Net Settled</h3>
                <p>
                  {formatCurrency(
                    (reconciliation.totals?.successAmount || 0) -
                      (reconciliation.totals?.refundedAmount || 0)
                  )}
                </p>
              </div>
              <div className="stat-card">
                <h3>Tips (paid)</h3>
                <p>{formatCurrency(reconciliation.totals?.tipSuccessTotal || 0)}</p>
              </div>
              <div className="stat-card">
                <h3>Service fees (paid)</h3>
                <p>
                  {formatCurrency(reconciliation.totals?.serviceFeeSuccessTotal || 0)}
                </p>
              </div>
            </div>

            <div className="reconciliation-table-wrap">
              <table className="payments-table reconciliation-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Total</th>
                    <th>Success</th>
                    <th>Refunded</th>
                    <th>Failed</th>
                    <th>Pending/Processing</th>
                    <th>Success Amount</th>
                    <th>Refunded Amount</th>
                    <th>Net</th>
                    <th>Tips (paid)</th>
                    <th>Svc fees (paid)</th>
                  </tr>
                </thead>
                <tbody>
                  {(reconciliation.days || []).map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{row.totalCount || 0}</td>
                      <td>{row.successCount || 0}</td>
                      <td>{row.refundedCount || 0}</td>
                      <td>{row.failedCount || 0}</td>
                      <td>{row.processingCount || 0}</td>
                      <td>{formatCurrency(row.successAmount || 0)}</td>
                      <td>{formatCurrency(row.refundedAmount || 0)}</td>
                      <td>
                        {formatCurrency(
                          (row.successAmount || 0) - (row.refundedAmount || 0)
                        )}
                      </td>
                      <td>{formatCurrency(row.tipSuccessTotal || 0)}</td>
                      <td>{formatCurrency(row.serviceFeeSuccessTotal || 0)}</td>
                    </tr>
                  ))}
                  {(reconciliation.days || []).length === 0 && (
                    <tr>
                      <td colSpan={11}>No reconciliation rows for selected range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {reconciliation.depth && (
              <div className="recon-depth">
                <h4 className="recon-depth-title">Extended reconciliation</h4>
                <p className="recon-depth-note">
                  Webhook counts use provider deliveries in range. Drift compares the latest
                  stored webhook outcome per payment (payments created in range) to the current
                  payment record. Order mismatch compares payment vs order payment snapshot.
                </p>

                <div className="recon-depth-summary">
                  <div className="stat-card">
                    <h3>Webhook events</h3>
                    <p>{reconciliation.depth.webhookTotals?.webhookEventCount ?? 0}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Webhook vs DB drift</h3>
                    <p>{reconciliation.depth.webhookVsPaymentDrift?.count ?? 0}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Order / payment mismatch</h3>
                    <p>{reconciliation.depth.orderPaymentMismatch?.count ?? 0}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Stale online pending</h3>
                    <p>
                      {reconciliation.depth.staleOnlinePending?.totalMatching ?? 0}
                      <span className="recon-sub">
                        {" "}
                        (&gt;{reconciliation.depth.staleOnlinePending?.olderThanHours ?? 0}h)
                      </span>
                    </p>
                  </div>
                  <div className="stat-card">
                    <h3>Razorpay success missing ref</h3>
                    <p>
                      {reconciliation.depth.successRazorpayMissingRefs?.totalMatching ?? 0}
                    </p>
                  </div>
                </div>

                <div className="reconciliation-table-wrap">
                  <h5>Webhooks by day</h5>
                  <table className="payments-table reconciliation-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Events</th>
                        <th>Reported success</th>
                        <th>Reported failed</th>
                        <th>Reported cancelled</th>
                        <th>Legacy (no status)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reconciliation.depth.webhookDays || []).map((row) => (
                        <tr key={row.day}>
                          <td>{row.day}</td>
                          <td>{row.webhookEventCount ?? 0}</td>
                          <td>{row.webhookReportedSuccess ?? 0}</td>
                          <td>{row.webhookReportedFailed ?? 0}</td>
                          <td>{row.webhookReportedCancelled ?? 0}</td>
                          <td>{row.webhookLegacyNoReportedStatus ?? 0}</td>
                        </tr>
                      ))}
                      {(reconciliation.depth.webhookDays || []).length === 0 && (
                        <tr>
                          <td colSpan={6}>No webhook events in range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {renderReconSampleTable(
                  "Webhook vs payment drift",
                  reconciliation.depth.webhookVsPaymentDrift,
                  [
                    "Payment ID",
                    "Order #",
                    "Payment status",
                    "Last webhook",
                    "Webhook at",
                    "Amount",
                  ],
                  (r) => [
                    r.paymentId,
                    r.orderNumber,
                    r.paymentStatus,
                    r.lastWebhookReported,
                    r.lastWebhookAt ? formatDate(r.lastWebhookAt) : "—",
                    formatCurrency(r.amount || 0),
                  ]
                )}

                {renderReconSampleTable(
                  "Order vs payment mismatch",
                  reconciliation.depth.orderPaymentMismatch,
                  [
                    "Payment ID",
                    "Order #",
                    "Payment status",
                    "Order payment status",
                    "Amount",
                    "Method",
                  ],
                  (r) => [
                    r.paymentId,
                    r.orderNumber,
                    r.paymentStatus,
                    r.orderPaymentStatus,
                    formatCurrency(r.amount || 0),
                    getPaymentMethodLabel(r.paymentMethod),
                  ]
                )}

                {renderReconSampleTable(
                  "Stale online pending",
                  reconciliation.depth.staleOnlinePending,
                  [
                    "Payment ID",
                    "Order #",
                    "Status",
                    "Created",
                    "Provider ref",
                    "Amount",
                  ],
                  (r) => [
                    r.paymentId,
                    r.orderNumber,
                    r.status,
                    formatDate(r.createdAt),
                    r.providerPaymentId || "—",
                    formatCurrency(r.amount || 0),
                  ]
                )}

                {renderReconSampleTable(
                  "Razorpay success missing provider ref",
                  reconciliation.depth.successRazorpayMissingRefs,
                  [
                    "Payment ID",
                    "Order #",
                    "Txn id",
                    "Provider id",
                    "Amount",
                    "Created",
                  ],
                  (r) => [
                    r.paymentId,
                    r.orderNumber,
                    r.transactionId || "—",
                    r.providerPaymentId || "—",
                    formatCurrency(r.amount || 0),
                    r.createdAt ? formatDate(r.createdAt) : "—",
                  ]
                )}
              </div>
            )}
          </>
        )}
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

