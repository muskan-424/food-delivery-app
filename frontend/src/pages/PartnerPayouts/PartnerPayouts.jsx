import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { formatCurrency } from "../../utils/currency";
import "./PartnerPayouts.css";

const PartnerPayouts = () => {
  const { token, url, partnerPayoutAccess, partnerAccessResolved } = useContext(StoreContext);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    if (!partnerAccessResolved) return;
    if (!partnerPayoutAccess) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${url}/api/restaurant/partner/payouts/batch`, {
          headers: { token },
        });
        if (cancelled) return;
        if (res.data.success) {
          setRows(res.data.data || []);
        } else {
          toast.error(res.data.message || "Could not load payouts");
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e.response?.data?.message || "Could not load payouts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, url, partnerPayoutAccess, partnerAccessResolved, navigate]);

  const loadDetail = async (batchId) => {
    try {
      const res = await axios.get(`${url}/api/restaurant/partner/payouts/batch/${batchId}`, {
        headers: { token },
      });
      if (res.data.success) setDetail(res.data.data);
      else toast.error(res.data.message || "Could not load batch");
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not load batch");
    }
  };

  const downloadCsv = async (batchId) => {
    try {
      const res = await axios.get(
        `${url}/api/restaurant/partner/payouts/batch/${batchId}/export.csv`,
        { headers: { token }, responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `payout-${batchId}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Could not download CSV");
    }
  };

  if (!token) return null;

  if (!partnerAccessResolved) {
    return (
      <div className="partner-payouts-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (!partnerPayoutAccess) {
    return (
      <div className="partner-payouts-page">
        <h1>Partner payouts</h1>
        <p>You do not have access to restaurant payout reports.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="partner-payouts-page">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="partner-payouts-page">
      <h1>Your restaurant payouts</h1>
      <p className="partner-payouts-note">
        Read-only view of payout batches that include your restaurant. Totals match platform accounting
        (commission on tax-exclusive item basis when tax-inclusive menu pricing is enabled).
      </p>
      {rows.length === 0 ? (
        <p>No payout batches yet.</p>
      ) : (
        <table className="partner-payouts-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th>Orders</th>
              <th>Est. net</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const r = b.restaurantPayout;
              return (
                <tr key={String(b._id)}>
                  <td>
                    {new Date(b.periodStart).toLocaleDateString()} –{" "}
                    {new Date(b.periodEnd).toLocaleDateString()}
                  </td>
                  <td>{b.status}</td>
                  <td>{r?.orderCount ?? "—"}</td>
                  <td>{formatCurrency(r?.estimatedNet ?? 0)}</td>
                  <td>
                    <button type="button" onClick={() => loadDetail(b._id)}>
                      Details
                    </button>{" "}
                    <button type="button" onClick={() => downloadCsv(b._id)}>
                      CSV
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {detail && (
        <div className="partner-payouts-detail">
          <h2>Batch detail</h2>
          <p>
            <strong>Status:</strong> {detail.status} · <strong>Currency:</strong> {detail.currency}
          </p>
          {detail.restaurantPayout && (
            <ul>
              <li>Orders: {detail.restaurantPayout.orderCount}</li>
              <li>Items basis: {formatCurrency(detail.restaurantPayout.itemsBasis ?? 0)}</li>
              <li>Commission: {formatCurrency(detail.restaurantPayout.commission ?? 0)}</li>
              <li>Estimated net: {formatCurrency(detail.restaurantPayout.estimatedNet ?? 0)}</li>
              {Number(detail.restaurantPayout.minimumPayoutAmount) > 0 ? (
                <li>
                  Minimum payout threshold:{" "}
                  {formatCurrency(detail.restaurantPayout.minimumPayoutAmount)}{" "}
                  {detail.restaurantPayout.meetsMinimumPayout === false
                    ? "(below threshold for this period)"
                    : "(met)"}
                </li>
              ) : null}
            </ul>
          )}
          <button type="button" onClick={() => setDetail(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default PartnerPayouts;
