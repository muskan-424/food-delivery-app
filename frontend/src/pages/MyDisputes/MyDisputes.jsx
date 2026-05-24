import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import "./MyDisputes.css";

const statusLabel = (s) => {
  const map = {
    open: "Open",
    in_review: "In review",
    awaiting_customer: "Awaiting your reply",
    resolved: "Resolved",
    closed: "Closed",
  };
  return map[s] || s || "—";
};

const MyDisputes = () => {
  const { url, token } = useContext(StoreContext);
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  const load = async () => {
    if (!token) {
      navigate("/");
      return;
    }
    try {
      setLoading(true);
      const res = await axios.get(`${url}/api/disputes/mine`, {
        headers: { token },
      });
      if (res.data?.success) {
        setRows(res.data.data || []);
      } else {
        toast.error(res.data?.message || "Could not load disputes");
      }
    } catch {
      toast.error("Could not load disputes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, url]);

  const submitReply = async (disputeId) => {
    const text = replyText.trim();
    if (text.length < 5) {
      toast.error("Reply should be at least 5 characters.");
      return;
    }
    try {
      setSubmittingReply(true);
      const res = await axios.post(
        `${url}/api/disputes/${disputeId}/reply`,
        { text },
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Reply submitted");
        setReplyText("");
        setReplyingId("");
        load();
      } else {
        toast.error(res.data?.message || "Could not submit reply");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not submit reply");
    } finally {
      setSubmittingReply(false);
    }
  };

  if (!token) return null;

  return (
    <div className="my-disputes-page">
      <div className="my-disputes-head">
        <h1>My disputes</h1>
        <Link to="/myorders" className="my-disputes-back">
          ← Back to orders
        </Link>
      </div>
      <p className="my-disputes-intro">
        Track issues you have reported. For new reports, open a dispute from an order on{" "}
        <Link to="/myorders">My Orders</Link>.
      </p>
      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="my-disputes-empty">You have not submitted any disputes yet.</p>
      ) : (
        <ul className="my-disputes-list">
          {rows.map((d) => (
            <li key={d._id} className="my-disputes-card">
              <div className="my-disputes-card-top">
                <span className="my-disputes-num">{d.disputeNumber}</span>
                <span className={`my-disputes-status my-disputes-status--${d.status}`}>
                  {statusLabel(d.status)}
                </span>
              </div>
              {d.subject ? <p className="my-disputes-subject">{d.subject}</p> : null}
              <p className="my-disputes-meta">
                Order{" "}
                <strong>
                  {d.orderId?.orderNumber || (typeof d.orderId === "string" ? d.orderId : "")}
                </strong>
                {d.orderId?.status ? ` · ${d.orderId.status}` : ""}
              </p>
              <p className="my-disputes-desc">{d.description?.slice(0, 220)}{d.description?.length > 220 ? "…" : ""}</p>
              <p className="my-disputes-date">
                Opened {d.createdAt ? new Date(d.createdAt).toLocaleString() : ""}
              </p>
              {d.resolution && d.status === "resolved" ? (
                <p className="my-disputes-resolution">
                  <strong>Resolution:</strong> {d.resolution}
                </p>
              ) : null}
              {d.status === "awaiting_customer" && (
                <div style={{ marginTop: 12 }}>
                  {replyingId === d._id ? (
                    <>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="Add extra details requested by support..."
                        style={{ width: "100%", marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => submitReply(d._id)}
                          disabled={submittingReply}
                        >
                          {submittingReply ? "Submitting..." : "Submit reply"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingId("");
                            setReplyText("");
                          }}
                          disabled={submittingReply}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setReplyingId(d._id)}>
                      Add requested details
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MyDisputes;
