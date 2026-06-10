import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { formatCurrency } from "../../utils/currency";
import "./EscrowOps.css";

const EscrowOps = ({ url }) => {
  const { token, admin } = useContext(StoreContext);
  const navigate = useNavigate();
  const [escrow, setEscrow] = useState(null);
  const [payments, setPayments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState("");
  const [fraudReason, setFraudReason] = useState("");
  const [fraudNote, setFraudNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const [escRes, payRes] = await Promise.all([
        axios.get(`${url}/api/admin/users/metrics/escrow`, { headers: { token } }),
        axios.get(`${url}/api/admin/users/metrics/payments`, { headers: { token } }),
      ]);
      if (escRes.data?.success) setEscrow(escRes.data.data);
      if (payRes.data?.success) setPayments(payRes.data.data);
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to load ops metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !admin) {
      navigate("/");
      return;
    }
    loadMetrics();
  }, [token, admin]);

  const initiatePayout = async () => {
    const id = orderId.trim();
    if (!id) {
      toast.error("Order ID is required");
      return;
    }
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/payment/razorpay/payout/initiate-escrow`,
        { orderId: id },
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success(res.data.message || "Payout initiated");
        loadMetrics();
      } else {
        toast.error(res.data?.message || "Payout failed");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Error initiating payout");
    } finally {
      setBusy(false);
    }
  };

  const overrideFraud = async () => {
    const id = orderId.trim();
    if (!id || fraudReason.trim().length < 2) {
      toast.error("Order ID and reason code (min 2 chars) required");
      return;
    }
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/payment/razorpay/payout/override-fraud-block`,
        { orderId: id, reasonCode: fraudReason.trim(), note: fraudNote.trim() },
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success(res.data.message || "Override recorded");
      } else {
        toast.error(res.data?.message || "Override failed");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Error recording override");
    } finally {
      setBusy(false);
    }
  };

  const statusRows = escrow?.byStatus
    ? Object.entries(escrow.byStatus).filter(([, v]) => v.count > 0)
    : [];

  return (
    <div className="escrow-ops-page">
      <div className="escrow-ops-header">
        <h2>Escrow &amp; payment ops</h2>
        <button type="button" onClick={loadMetrics} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !escrow ? (
        <p className="escrow-ops-muted">Loading metrics…</p>
      ) : (
        <>
          <div className="escrow-ops-cards">
            <div className="escrow-ops-card">
              <span className="label">Escrow enabled</span>
              <strong>{escrow?.enabled ? "Yes" : "No"}</strong>
            </div>
            <div className="escrow-ops-card">
              <span className="label">Total escrows</span>
              <strong>{escrow?.total ?? 0}</strong>
            </div>
            <div className="escrow-ops-card">
              <span className="label">Total held (INR)</span>
              <strong>{formatCurrency(escrow?.totalAmountInr ?? 0)}</strong>
            </div>
            <div className="escrow-ops-card highlight">
              <span className="label">Pending release</span>
              <strong>{escrow?.pipeline?.pendingRelease ?? 0}</strong>
            </div>
            <div className="escrow-ops-card warn">
              <span className="label">Dispute opened</span>
              <strong>{escrow?.pipeline?.disputeOpened ?? 0}</strong>
            </div>
            <div className="escrow-ops-card">
              <span className="label">Awaiting payout</span>
              <strong>{escrow?.pipeline?.awaitingPayout ?? 0}</strong>
            </div>
            <div className="escrow-ops-card">
              <span className="label">Payout failed (7d)</span>
              <strong>{escrow?.pipeline?.payoutFailedLast7d ?? 0}</strong>
            </div>
            <div className="escrow-ops-card">
              <span className="label">Pending payments</span>
              <strong>{payments?.payments?.pendingCount ?? 0}</strong>
            </div>
          </div>

          {statusRows.length > 0 && (
            <div className="escrow-ops-status-table">
              <h3>Escrow by status</h3>
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Count</th>
                    <th>Amount (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {statusRows.map(([status, row]) => (
                    <tr key={status}>
                      <td>{status}</td>
                      <td>{row.count}</td>
                      <td>{formatCurrency(row.totalAmountInr || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {payments && (
            <div className="escrow-ops-payments-panel">
              <h3>Payment reconciliation (7d)</h3>
              <ul>
                <li>Webhooks received: {payments.webhooks?.total7d ?? 0}</li>
                <li>
                  Webhook lag:{" "}
                  {payments.webhooks?.lagMinutes != null
                    ? `${payments.webhooks.lagMinutes} min`
                    : "—"}
                </li>
                <li>Reconciliation drift: {payments.reconciliation?.webhookVsPaymentDrift ?? 0}</li>
                <li>Stale pending: {payments.reconciliation?.stalePendingCount ?? 0}</li>
                <li>Notifications (7d): {payments.notifications?.total7d ?? 0}</li>
              </ul>
            </div>
          )}
        </>
      )}

      <div className="escrow-ops-actions">
        <h3>Admin actions</h3>
        <label>Order ID (MongoDB)</label>
        <input
          type="text"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Order _id"
        />
        <div className="escrow-ops-action-row">
          <button type="button" onClick={initiatePayout} disabled={busy}>
            Initiate escrow payout
          </button>
        </div>
        <label>Fraud override reason code</label>
        <input
          type="text"
          value={fraudReason}
          onChange={(e) => setFraudReason(e.target.value)}
          placeholder="e.g. manual_review_cleared"
        />
        <label>Fraud override note</label>
        <textarea
          value={fraudNote}
          onChange={(e) => setFraudNote(e.target.value)}
          placeholder="Optional note for audit trail"
          rows={2}
        />
        <button type="button" className="secondary" onClick={overrideFraud} disabled={busy}>
          Record fraud override
        </button>
      </div>
    </div>
  );
};

export default EscrowOps;
