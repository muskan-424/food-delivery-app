import React, { useContext, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import "./OpenDisputeModal.css";

const CATEGORIES = [
  { value: "order_issue", label: "Order issue" },
  { value: "payment", label: "Payment" },
  { value: "delivery", label: "Delivery" },
  { value: "quality", label: "Food quality" },
  { value: "refund", label: "Refund" },
  { value: "other", label: "Other" },
];

const OpenDisputeModal = ({ order, onClose, onSuccess }) => {
  const { url, token } = useContext(StoreContext);
  const [category, setCategory] = useState("order_issue");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const desc = description.trim();
    if (desc.length < 10) {
      toast.error("Please describe the issue in at least 10 characters.");
      return;
    }
    try {
      setSubmitting(true);
      const res = await axios.post(
        `${url}/api/disputes`,
        {
          orderId: order._id,
          category,
          subject: subject.trim(),
          description: desc,
        },
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success(res.data.message || "Dispute submitted");
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.data?.message || "Could not submit dispute");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.status === 409
          ? "You already have an open dispute for this order."
          : "Could not submit dispute");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="open-dispute-overlay" onClick={onClose} role="presentation">
      <div className="open-dispute-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>Report a problem</h3>
        <p className="open-dispute-order">
          Order #{order?.orderNumber || order?._id?.slice(-8)}
        </p>
        <p className="open-dispute-note">
          We will review your case and may contact you. For payment issues, include transaction details
          in the description.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="open-dispute-label">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="open-dispute-label">
            Subject (optional)
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Short summary"
            />
          </label>
          <label className="open-dispute-label">
            What happened?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={8000}
              placeholder="Please give enough detail for our team to help (min. 10 characters)."
            />
          </label>
          <div className="open-dispute-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OpenDisputeModal;
