import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { StoreContext } from "../../context/StoreContext";
import "./OrderEvidencePanel.css";

const OrderEvidencePanel = ({ orderId }) => {
  const { url, token } = useContext(StoreContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${url}/api/order/${orderId}/evidence`, {
          headers: { token },
        });
        if (!cancelled && res.data?.success) {
          setData(res.data.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load delivery evidence");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, token, url]);

  if (loading) return <p className="order-evidence-muted">Loading delivery evidence…</p>;
  if (error) return <p className="order-evidence-error">{error}</p>;

  const pod = data?.proofOfDelivery || {};
  const hasImages = pod.beforeImageUrl || pod.afterImageUrl || pod.evidenceUrl;

  if (!hasImages && !pod.signatureName && pod.method === "none") {
    return (
      <p className="order-evidence-muted">
        No proof-of-delivery uploaded yet for this order.
      </p>
    );
  }

  return (
    <div className="order-evidence-panel">
      <strong>Delivery evidence</strong>
      <p className="order-evidence-meta">
        Method: {pod.method || "—"}
        {pod.verifiedAt && ` · Verified ${new Date(pod.verifiedAt).toLocaleString()}`}
      </p>
      {pod.note && <p className="order-evidence-note">{pod.note}</p>}
      {pod.signatureName && (
        <p className="order-evidence-sig">Signature: {pod.signatureName}</p>
      )}
      <div className="order-evidence-images">
        {pod.beforeImageUrl && (
          <figure>
            <figcaption>Before</figcaption>
            <img src={pod.beforeImageUrl} alt="Before delivery" />
          </figure>
        )}
        {pod.afterImageUrl && (
          <figure>
            <figcaption>After</figcaption>
            <img src={pod.afterImageUrl} alt="After delivery" />
          </figure>
        )}
        {!pod.beforeImageUrl && !pod.afterImageUrl && pod.evidenceUrl && (
          <figure>
            <figcaption>Proof</figcaption>
            <img src={pod.evidenceUrl} alt="Delivery proof" />
          </figure>
        )}
      </div>
      {data?.deliveryVerificationResult && (
        <p className="order-evidence-verify">
          Verification: {data.deliveryVerificationResult.status || "recorded"}
        </p>
      )}
    </div>
  );
};

export default OrderEvidencePanel;
