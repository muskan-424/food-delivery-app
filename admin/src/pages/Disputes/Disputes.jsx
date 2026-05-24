import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { formatCurrency } from "../../utils/currency";
import "./Disputes.css";

const STATUS_OPTIONS = [
  "all",
  "open",
  "in_review",
  "awaiting_customer",
  "resolved",
  "closed",
];

const statusColor = (s) => {
  const map = {
    open: "#f57c00",
    in_review: "#1976d2",
    awaiting_customer: "#7b1fa2",
    resolved: "#388e3c",
    closed: "#757575",
  };
  return map[s] || "#757575";
};

const Disputes = ({ url }) => {
  const { token, admin } = useContext(StoreContext);
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    limit: 25,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status: "open",
    priority: "normal",
    resolution: "",
    internalNote: "",
    paymentId: "",
  });
  const [paymentIdInitial, setPaymentIdInitial] = useState("");

  useEffect(() => {
    if (!token || !admin) {
      navigate("/");
      return;
    }
    fetchList();
  }, [token, admin, page, statusFilter]);

  const fetchList = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pagination.limit));
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await axios.get(
        `${url}/api/disputes/admin/all?${params.toString()}`,
        { headers: { token } }
      );
      if (!res.data?.success) {
        toast.error(res.data?.message || "Failed to load disputes");
        return;
      }
      setList(res.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: res.data.pagination?.total || 0,
        totalPages: res.data.pagination?.totalPages || 0,
      }));
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || "Error loading disputes");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      setDetailLoading(true);
      const res = await axios.get(`${url}/api/disputes/${id}`, {
        headers: { token },
      });
      if (!res.data?.success) {
        toast.error(res.data?.message || "Failed to load dispute");
        return;
      }
      const d = res.data.data;
      setDetail(d);
      const payId =
        d.paymentId?._id != null
          ? String(d.paymentId._id)
          : d.paymentId != null
            ? String(d.paymentId)
            : "";
      setPaymentIdInitial(payId);
      setForm({
        status: d.status || "open",
        priority: d.priority || "normal",
        resolution: d.resolution || "",
        internalNote: "",
        paymentId: payId,
      });
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || "Error loading dispute");
    } finally {
      setDetailLoading(false);
    }
  };

  const selectRow = (id) => {
    setSelectedId(id);
    loadDetail(id);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      const body = {
        status: form.status,
        priority: form.priority,
        resolution: form.resolution,
      };
      if (form.internalNote.trim()) {
        body.internalNote = form.internalNote.trim();
      }
      const pidNow = form.paymentId.trim();
      const pidWas = paymentIdInitial.trim();
      if (pidNow !== pidWas) {
        body.paymentId = pidNow || null;
      }

      const res = await axios.patch(
        `${url}/api/disputes/admin/${selectedId}`,
        body,
        { headers: { token } }
      );
      if (!res.data?.success) {
        toast.error(res.data?.message || "Update failed");
        return;
      }
      toast.success("Dispute updated");
      setForm((f) => ({ ...f, internalNote: "" }));
      fetchList();
      loadDetail(selectedId);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || "Error saving");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const orderNum = (row) => {
    const o = row.orderId;
    if (!o || typeof o !== "object") return "—";
    return o.orderNumber != null && o.orderNumber !== "" ? o.orderNumber : "—";
  };

  return (
    <div className="disputes-page">
      <div className="disputes-header">
        <h2>Disputes</h2>
        <div className="disputes-filters">
          <div className="filter-group">
            <label htmlFor="dispute-status">Status</label>
            <select
              id="dispute-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="disputes-layout">
        <div className="disputes-table-wrap">
          {loading ? (
            <div className="disputes-loading">Loading…</div>
          ) : list.length === 0 ? (
            <div className="disputes-empty">No disputes found.</div>
          ) : (
            <table className="disputes-table">
              <thead>
                <tr>
                  <th>Dispute #</th>
                  <th>Order #</th>
                  <th>User</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Payment</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const id = row._id;
                  const pay = row.paymentId;
                  return (
                    <tr
                      key={id}
                      className={selectedId === id ? "selected" : ""}
                      onClick={() => selectRow(id)}
                    >
                      <td>{row.disputeNumber}</td>
                      <td>{orderNum(row)}</td>
                      <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.userId}
                      </td>
                      <td>{row.category?.replace(/_/g, " ")}</td>
                      <td>
                        <span
                          className="dispute-pill"
                          style={{
                            background: `${statusColor(row.status)}22`,
                            color: statusColor(row.status),
                          }}
                        >
                          {row.status?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>{row.priority}</td>
                      <td>
                        {pay && typeof pay === "object"
                          ? `${pay.status} · ${formatCurrency(pay.amount || 0)}`
                          : "—"}
                      </td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {pagination.totalPages > 1 && (
            <div style={{ padding: 12, display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span style={{ lineHeight: "32px" }}>
                Page {page} / {pagination.totalPages || 1}
              </span>
              <button
                type="button"
                disabled={page >= (pagination.totalPages || 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="dispute-detail-panel">
          {!selectedId && (
            <p className="muted">Select a dispute to view and update.</p>
          )}
          {selectedId && detailLoading && <p className="muted">Loading detail…</p>}
          {selectedId && !detailLoading && detail && (
            <>
              <h3>{detail.disputeNumber}</h3>
              <p className="muted">
                Order: {detail.orderId?.orderNumber || "—"} · Customer: {detail.userId}
              </p>
              <p>
                <strong>{detail.subject || "(no subject)"}</strong>
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>{detail.description}</p>

              {detail.paymentId && typeof detail.paymentId === "object" && (
                <p style={{ fontSize: 13 }}>
                  Linked payment: {detail.paymentId.status} ·{" "}
                  {formatCurrency(detail.paymentId.amount || 0)} ·{" "}
                  {detail.paymentId.paymentMethod || ""}
                </p>
              )}

              <label className="dispute-field-label">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUS_OPTIONS.filter((s) => s !== "all").map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>

              <label className="dispute-field-label">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
              </select>

              <label className="dispute-field-label">Resolution (customer-visible summary)</label>
              <textarea
                value={form.resolution}
                onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                placeholder="Resolution notes…"
              />

              <label className="dispute-field-label">
                Link payment (MongoDB payment id, or empty to clear)
              </label>
              <input
                type="text"
                value={form.paymentId}
                onChange={(e) => setForm((f) => ({ ...f, paymentId: e.target.value }))}
                placeholder="Payment _id"
              />

              <label className="dispute-field-label">Internal note (append)</label>
              <textarea
                value={form.internalNote}
                onChange={(e) => setForm((f) => ({ ...f, internalNote: e.target.value }))}
                placeholder="Visible to admins only…"
              />

              {detail.internalNotes?.length > 0 && (
                <>
                  <label className="dispute-field-label">Internal history</label>
                  <div className="dispute-notes">
                    {detail.internalNotes.map((n, i) => (
                      <pre key={i}>
                        {formatDate(n.createdAt)} — {n.text}
                      </pre>
                    ))}
                  </div>
                </>
              )}
              {detail.customerReplies?.length > 0 && (
                <>
                  <label className="dispute-field-label">Customer replies</label>
                  <div className="dispute-notes">
                    {detail.customerReplies.map((r, i) => (
                      <pre key={i}>
                        {formatDate(r.createdAt)} — {r.text}
                      </pre>
                    ))}
                  </div>
                </>
              )}
              {detail.statusHistory?.length > 0 && (
                <>
                  <label className="dispute-field-label">Status timeline</label>
                  <div className="dispute-notes">
                    {detail.statusHistory.map((h, i) => (
                      <pre key={i}>
                        {formatDate(h.createdAt)} — {h.from || "none"} → {h.to} ({h.actorType})
                      </pre>
                    ))}
                  </div>
                </>
              )}

              <button
                type="button"
                className="dispute-save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Disputes;
