import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { formatCurrency } from "../../utils/currency";
import "./Payouts.css";

const initialForm = {
  periodStart: "",
  periodEnd: "",
  statuses: "delivered",
};

const Payouts = ({ url }) => {
  const { token, admin } = useContext(StoreContext);
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [preview, setPreview] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [filters, setFilters] = useState({ status: "all", belowMinimum: "all" });
  const [statusUpdateFields, setStatusUpdateFields] = useState({ notes: "", paidReference: "" });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (!token || !admin) {
      navigate("/");
      return;
    }
    fetchBatches();
  }, [token, admin, pagination.page, filters.status, filters.belowMinimum]);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("page", String(pagination.page));
      params.append("limit", String(pagination.limit));
      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.belowMinimum !== "all") params.append("belowMinimum", filters.belowMinimum);
      const res = await axios.get(`${url}/api/restaurant/payouts/batch?${params.toString()}`, {
        headers: { token },
      });
      if (!res.data?.success) {
        toast.error(res.data?.message || "Failed to load payout batches");
        return;
      }
      setBatches(res.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: res.data.pagination?.total || 0,
        totalPages: res.data.pagination?.totalPages || 0,
      }));
    } catch (error) {
      console.error("fetchBatches:", error);
      toast.error(error.response?.data?.message || "Error loading payout batches");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!form.periodStart || !form.periodEnd) {
      toast.error("Period start and end are required");
      return;
    }
    try {
      setLoading(true);
      const body = {
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        statuses: form.statuses,
      };
      const res = await axios.post(`${url}/api/restaurant/payouts/preview`, body, {
        headers: { token },
      });
      if (!res.data?.success) {
        toast.error(res.data?.message || "Failed to preview payout");
        return;
      }
      setPreview(res.data.data || null);
      toast.success("Payout preview loaded");
    } catch (error) {
      console.error("handlePreview:", error);
      toast.error(error.response?.data?.message || "Error previewing payout");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!preview || !form.periodStart || !form.periodEnd) {
      toast.error("Generate preview first");
      return;
    }
    try {
      setCreating(true);
      const body = {
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        statuses: form.statuses,
      };
      const res = await axios.post(`${url}/api/restaurant/payouts/batch`, body, {
        headers: { token },
      });
      if (!res.data?.success) {
        toast.error(res.data?.message || "Failed to create payout batch");
        return;
      }
      toast.success("Payout batch created");
      setPreview(null);
      fetchBatches();
    } catch (error) {
      console.error("handleCreateBatch:", error);
      toast.error(error.response?.data?.message || "Error creating payout batch");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusAdvance = async (batch, nextStatus) => {
    try {
      const body = { status: nextStatus };
      if (statusUpdateFields.notes.trim()) body.notes = statusUpdateFields.notes.trim();
      if (statusUpdateFields.paidReference.trim()) {
        body.paidReference = statusUpdateFields.paidReference.trim();
      }
      const res = await axios.patch(
        `${url}/api/restaurant/payouts/batch/${batch._id}/status`,
        body,
        { headers: { token } }
      );
      if (!res.data?.success) {
        toast.error(res.data?.message || "Could not update status");
        return;
      }
      toast.success(`Batch marked ${nextStatus}`);
      setStatusUpdateFields({ notes: "", paidReference: "" });
      fetchBatches();
    } catch (error) {
      console.error("handleStatusAdvance:", error);
      toast.error(error.response?.data?.message || "Error updating payout batch");
    }
  };

  const handleExportCsv = async (batchId) => {
    try {
      const res = await axios.get(`${url}/api/restaurant/payouts/batch/${batchId}/export.csv`, {
        headers: { token },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `payout-batch-${batchId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      console.error("handleExportCsv:", error);
      toast.error(error.response?.data?.message || "Could not export CSV");
    }
  };

  const handleOpenBatchDetail = async (batchId) => {
    try {
      setDetailLoading(true);
      const res = await axios.get(`${url}/api/restaurant/payouts/batch/${batchId}`, {
        headers: { token },
      });
      if (!res.data?.success) {
        toast.error(res.data?.message || "Could not load batch details");
        return;
      }
      setSelectedBatch(res.data.data || null);
    } catch (error) {
      console.error("handleOpenBatchDetail:", error);
      toast.error(error.response?.data?.message || "Error loading batch details");
    } finally {
      setDetailLoading(false);
    }
  };

  const nextStatusFor = (status) => {
    if (status === "draft") return "finalized";
    if (status === "finalized") return "paid";
    if (status === "paid") return "reconciled";
    return null;
  };

  return (
    <div className="payouts-page">
      <div className="payouts-header">
        <h2>Payout Batches</h2>
      </div>

      <div className="payouts-create-card">
        <h3>Create Payout Batch</h3>
        <div className="payouts-form-grid">
          <div className="field">
            <label>Period Start</label>
            <input
              type="datetime-local"
              value={form.periodStart}
              onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Period End</label>
            <input
              type="datetime-local"
              value={form.periodEnd}
              onChange={(e) => setForm((p) => ({ ...p, periodEnd: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Statuses (comma-separated)</label>
            <input
              type="text"
              value={form.statuses}
              onChange={(e) => setForm((p) => ({ ...p, statuses: e.target.value }))}
              placeholder="delivered"
            />
          </div>
        </div>
        <div className="payouts-actions">
          <button className="secondary" onClick={handlePreview} disabled={loading}>
            Preview
          </button>
          <button className="primary" onClick={handleCreateBatch} disabled={creating || !preview}>
            {creating ? "Creating..." : "Create Batch"}
          </button>
        </div>

        {preview && (
          <>
            <div className="preview-summary">
              <p>
                Orders: <strong>{preview.orderCount || 0}</strong>
              </p>
              <p>
                Commission: <strong>{formatCurrency(preview.totalCommission || 0)}</strong>
              </p>
              <p>
                Estimated Net: <strong>{formatCurrency(preview.totalEstimatedRestaurantNet || 0)}</strong>
              </p>
              <p className="preview-min-hint">
                Restaurants below their minimum payout threshold:{" "}
                <strong>
                  {(preview.byRestaurant || []).filter(
                    (r) => r.meetsMinimumPayout === false
                  ).length || 0}
                </strong>{" "}
                (set <code>minimumPayoutAmount</code> on each restaurant)
              </p>
            </div>
            {(preview.byRestaurant || []).length > 0 && (
              <div className="table-wrap preview-rest-table">
                <table>
                  <thead>
                    <tr>
                      <th>Restaurant</th>
                      <th>Est. net</th>
                      <th>Min. payout</th>
                      <th>OK to pay?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.byRestaurant || []).map((r) => (
                      <tr key={String(r.restaurantId)}>
                        <td>{r.restaurantName || r.restaurantId}</td>
                        <td>{formatCurrency(r.estimatedNet || 0)}</td>
                        <td>{formatCurrency(r.minimumPayoutAmount ?? 0)}</td>
                        <td>
                          {r.meetsMinimumPayout !== false ? (
                            <span className="badge badge-paid">Yes</span>
                          ) : (
                            <span className="badge badge-draft">Below min</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="payouts-list-card">
        <div className="list-head">
          <h3>Existing Batches</h3>
          <select
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value }));
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="finalized">Finalized</option>
            <option value="paid">Paid</option>
            <option value="reconciled">Reconciled</option>
          </select>
          <select
            value={filters.belowMinimum}
            onChange={(e) => {
              setFilters((f) => ({ ...f, belowMinimum: e.target.value }));
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <option value="all">All thresholds</option>
            <option value="true">Has below-min restaurants</option>
            <option value="false">All restaurants above min</option>
          </select>
        </div>
        <div className="payouts-form-grid" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>Status update note (optional)</label>
            <input
              type="text"
              value={statusUpdateFields.notes}
              onChange={(e) =>
                setStatusUpdateFields((s) => ({ ...s, notes: e.target.value }))
              }
              placeholder="Reason / operator note"
              maxLength={2000}
            />
          </div>
          <div className="field">
            <label>Paid reference (optional)</label>
            <input
              type="text"
              value={statusUpdateFields.paidReference}
              onChange={(e) =>
                setStatusUpdateFields((s) => ({ ...s, paidReference: e.target.value }))
              }
              placeholder="UTR / transfer id"
              maxLength={200}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Period</th>
                <th>Status</th>
                <th>Orders</th>
                <th>Commission</th>
                <th>Est. Net</th>
                <th>Below Min</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const next = nextStatusFor(b.status);
                return (
                  <tr key={b._id}>
                    <td>{b._id?.slice(-8)}</td>
                    <td>
                      {new Date(b.periodStart).toLocaleDateString()} -{" "}
                      {new Date(b.periodEnd).toLocaleDateString()}
                    </td>
                    <td>
                      <span className={`badge badge-${b.status}`}>{b.status}</span>
                    </td>
                    <td>{b.orderCount || 0}</td>
                    <td>{formatCurrency(b.totalCommission || 0)}</td>
                    <td>{formatCurrency(b.totalEstimatedRestaurantNet || 0)}</td>
                    <td>{b.belowMinimumRestaurantCount || 0}</td>
                    <td>
                      <div className="row-actions">
                        {next && (
                          <button
                            className="small-btn"
                            onClick={() => handleStatusAdvance(b, next)}
                          >
                            Mark {next}
                          </button>
                        )}
                        <button className="small-btn secondary" onClick={() => handleOpenBatchDetail(b._id)}>
                          View
                        </button>
                        <button className="small-btn secondary" onClick={() => handleExportCsv(b._id)}>
                          CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-row">
                    {loading ? "Loading..." : "No payout batches found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="payout-pagination">
            <button
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              disabled={pagination.page <= 1}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {selectedBatch && (
        <div className="batch-detail-overlay" onClick={() => setSelectedBatch(null)}>
          <div className="batch-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="batch-detail-head">
              <h3>Batch Detail #{selectedBatch._id?.slice(-8)}</h3>
              <button className="small-btn secondary" onClick={() => setSelectedBatch(null)}>
                Close
              </button>
            </div>
            <div className="batch-detail-summary">
              <p>Status: <strong>{selectedBatch.status}</strong></p>
              <p>Orders: <strong>{selectedBatch.orderCount || 0}</strong></p>
              <p>Commission: <strong>{formatCurrency(selectedBatch.totalCommission || 0)}</strong></p>
              <p>Estimated Net: <strong>{formatCurrency(selectedBatch.totalEstimatedRestaurantNet || 0)}</strong></p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Orders</th>
                    <th>Items Basis</th>
                    <th>Commission</th>
                    <th>Estimated Net</th>
                    <th>Min. payout</th>
                    <th>OK?</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBatch.byRestaurant || []).map((r) => (
                    <tr key={r.restaurantId}>
                      <td>{r.restaurantName || r.restaurantId}</td>
                      <td>{r.orderCount || 0}</td>
                      <td>{formatCurrency(r.itemsBasis || 0)}</td>
                      <td>{formatCurrency(r.commission || 0)}</td>
                      <td>{formatCurrency(r.estimatedNet || 0)}</td>
                      <td>{formatCurrency(r.minimumPayoutAmount ?? 0)}</td>
                      <td>
                        {r.meetsMinimumPayout !== false ? (
                          <span className="badge badge-paid">Yes</span>
                        ) : (
                          <span className="badge badge-draft">Below</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(selectedBatch.byRestaurant || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-row">No restaurant rows</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {detailLoading && <div className="detail-loading">Loading batch detail...</div>}
    </div>
  );
};

export default Payouts;
