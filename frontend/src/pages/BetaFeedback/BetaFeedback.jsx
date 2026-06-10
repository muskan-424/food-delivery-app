import React, { useContext, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useLocation } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { useBeta } from "../../context/BetaContext";
import "./BetaFeedback.css";

const BetaFeedback = () => {
  const { url, token } = useContext(StoreContext);
  const { config } = useBeta();
  const location = useLocation();
  const [category, setCategory] = useState("ux");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const categories = config.feedback_categories || [
    "bug",
    "ux",
    "payment",
    "delivery",
    "other",
  ];

  const submit = async (e) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      toast.error("Please write at least 5 characters");
      return;
    }
    setSubmitting(true);
    try {
      const headers = token ? { token } : {};
      const res = await axios.post(
        `${url}/api/beta/feedback`,
        {
          category,
          message: message.trim(),
          email: email.trim() || undefined,
          page_path: location.pathname,
        },
        { headers }
      );
      if (res.data?.success) {
        toast.success("Thanks for your feedback!");
        setMessage("");
      } else {
        toast.error(res.data?.message || "Could not submit");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="beta-feedback-page">
      <h1>Beta feedback</h1>
      <p className="beta-feedback-intro">
        Help us improve TOMATO during the closed beta
        {config.city_label ? ` in ${config.city_label}` : ""}.
      </p>
      <form onSubmit={submit} className="beta-feedback-form">
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {!token && (
          <label>
            Email (optional)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
        )}
        <label>
          Your feedback
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="What worked well? What should we fix?"
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Submit feedback"}
        </button>
      </form>
    </div>
  );
};

export default BetaFeedback;
