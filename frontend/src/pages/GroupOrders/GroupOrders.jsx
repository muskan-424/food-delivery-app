import React, { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import { formatCurrency } from "../../utils/currency";
import "./GroupOrders.css";

const GroupOrders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, url, getTotalCartAmount } = useContext(StoreContext);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [myShare, setMyShare] = useState(null);
  const [splitSummary, setSplitSummary] = useState(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoJoinDoneCode, setAutoJoinDoneCode] = useState("");

  const splitTotal = useMemo(() => {
    const total = Number(getTotalCartAmount() || 0);
    return total > 0 ? Math.round(total * 100) / 100 : 0;
  }, [getTotalCartAmount]);

  const inviteCodeFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return String(params.get("inviteCode") || "").trim().toUpperCase();
  }, [location.search]);

  const loadMine = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${url}/api/order/group/mine/list`, {
        headers: { token },
      });
      if (res.data?.success) {
        setSessions(res.data?.data || []);
      }
    } catch {
      toast.error("Failed to load group sessions");
    }
  };

  const loadCurrentUser = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${url}/api/profile`, { headers: { token } });
      if (res.data?.success) {
        const uid = String(res.data?.data?._id || res.data?.data?.id || "").trim();
        setCurrentUserId(uid);
      }
    } catch {
      // keep silent; server-side auth still enforces permissions
    }
  };

  const openSession = async (sessionId) => {
    if (!sessionId) return;
    try {
      const [sessionRes, shareRes, splitRes] = await Promise.all([
        axios.get(`${url}/api/order/group/${encodeURIComponent(sessionId)}`, {
          headers: { token },
        }),
        axios.get(`${url}/api/order/group/${encodeURIComponent(sessionId)}/my-share`, {
          headers: { token },
        }),
        axios.get(`${url}/api/order/group/${encodeURIComponent(sessionId)}/split-payments`, {
          headers: { token },
        }),
      ]);
      if (sessionRes.data?.success) setSelectedSession(sessionRes.data?.data || null);
      if (shareRes.data?.success) setMyShare(shareRes.data?.data || null);
      if (splitRes.data?.success) setSplitSummary(splitRes.data?.data || null);
    } catch {
      toast.error("Failed to load group session");
    }
  };

  useEffect(() => {
    if (!token) return;
    loadCurrentUser();
    loadMine();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (!inviteCodeFromUrl) return;
    if (autoJoinDoneCode === inviteCodeFromUrl) return;
    setJoinCode(inviteCodeFromUrl);
    setAutoJoinDoneCode(inviteCodeFromUrl);
    (async () => {
      try {
        setBusy(true);
        const res = await axios.post(
          `${url}/api/order/group/join`,
          { inviteCode: inviteCodeFromUrl },
          { headers: { token } }
        );
        if (res.data?.success) {
          toast.success("Joined group session from invite link");
          await loadMine();
          const joined = res.data?.data;
          if (joined?._id) await openSession(joined._id);
        }
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to join from invite link");
      } finally {
        setBusy(false);
      }
    })();
  }, [token, inviteCodeFromUrl, autoJoinDoneCode, url]);

  const isLeader =
    !!selectedSession &&
    String(selectedSession.leaderUserId || "").trim() !== "" &&
    String(selectedSession.leaderUserId || "").trim() === String(currentUserId || "").trim();

  const copyInviteMessage = async () => {
    if (!selectedSession?.inviteCode) return;
    const inviteLink = `${window.location.origin}/group-orders?inviteCode=${encodeURIComponent(
      selectedSession.inviteCode
    )}`;
    const msg = `Join my group order.\nInvite code: ${selectedSession.inviteCode}\nLink: ${inviteLink}`;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Invite copied");
    } catch {
      toast.error("Could not copy invite");
    }
  };

  const createSession = async () => {
    try {
      setCreating(true);
      const res = await axios.post(
        `${url}/api/order/group/create`,
        {},
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Group session created");
        const created = res.data?.data;
        await loadMine();
        if (created?._id) await openSession(created._id);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create group session");
    } finally {
      setCreating(false);
    }
  };

  const joinSession = async () => {
    const inviteCode = String(joinCode || "").trim().toUpperCase();
    if (!inviteCode) {
      toast.error("Enter invite code");
      return;
    }
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/order/group/join`,
        { inviteCode },
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Joined group session");
        setJoinCode("");
        await loadMine();
        const joined = res.data?.data;
        if (joined?._id) await openSession(joined._id);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to join group session");
    } finally {
      setBusy(false);
    }
  };

  const setEqualSplit = async () => {
    if (!selectedSession?._id || splitTotal <= 0) {
      toast.error("Add items to cart before setting split");
      return;
    }
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/order/group/${encodeURIComponent(selectedSession._id)}/split-plan`,
        { totalAmount: splitTotal },
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Equal split set");
        await axios.post(
          `${url}/api/order/group/${encodeURIComponent(selectedSession._id)}/split-payments/init`,
          {},
          { headers: { token } }
        );
        await openSession(selectedSession._id);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to set split");
    } finally {
      setBusy(false);
    }
  };

  const leaveSession = async () => {
    if (!selectedSession?._id) return;
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/order/group/${encodeURIComponent(selectedSession._id)}/leave`,
        {},
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Left group session");
        setSelectedSession(null);
        await loadMine();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to leave session");
    } finally {
      setBusy(false);
    }
  };

  const closeSession = async () => {
    if (!selectedSession?._id) return;
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/order/group/${encodeURIComponent(selectedSession._id)}/close`,
        {},
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Session closed");
        await openSession(selectedSession._id);
        await loadMine();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to close session");
    } finally {
      setBusy(false);
    }
  };

  const gotoCheckoutForSession = () => {
    if (!selectedSession?._id) return;
    navigate(`/order?groupSessionId=${encodeURIComponent(selectedSession._id)}`);
  };

  const markMySharePaid = async () => {
    if (!selectedSession?._id) return;
    try {
      setBusy(true);
      const res = await axios.post(
        `${url}/api/order/group/${encodeURIComponent(selectedSession._id)}/my-share/pay`,
        {},
        { headers: { token } }
      );
      if (res.data?.success) {
        toast.success("Your share marked as paid");
        await openSession(selectedSession._id);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to mark share paid");
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <div className="group-orders-page">Please sign in to manage group orders.</div>;

  return (
    <div className="group-orders-page">
      <h2>Group Orders</h2>
      <div className="group-orders-actions">
        <button onClick={createSession} disabled={creating}>
          {creating ? "Creating..." : "Create Group Session"}
        </button>
        <input
          type="text"
          placeholder="Invite code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button onClick={joinSession} disabled={busy}>
          Join
        </button>
      </div>

      <div className="group-orders-layout">
        <div className="group-orders-list">
          <h3>My Sessions</h3>
          {sessions.length === 0 ? <p>No sessions yet.</p> : null}
          {sessions.map((s) => (
            <button
              key={s._id}
              className="group-session-item"
              onClick={() => openSession(s._id)}
            >
              <strong>{s.inviteCode}</strong> - {s.status} - {s.memberCount} members
            </button>
          ))}
        </div>

        <div className="group-orders-detail">
          <h3>Session Detail</h3>
          {!selectedSession ? <p>Select a session to view details.</p> : null}
          {selectedSession ? (
            <>
              <p>Invite code: <strong>{selectedSession.inviteCode}</strong></p>
              <p>Status: {selectedSession.status}</p>
              <p>Leader: {selectedSession.leaderUserId}</p>
              <p>Members: {(selectedSession.members || []).map((m) => m.name || m.userId).join(", ")}</p>
              {myShare ? (
                <p>
                  My share: <strong>{formatCurrency(myShare.myShareAmount || 0)}</strong> ({myShare.paymentStatus})
                </p>
              ) : null}
              {splitSummary ? (
                <div className="group-split-box">
                  <p>
                    Collection: {formatCurrency(splitSummary.paidAmount || 0)} /{" "}
                    {formatCurrency(splitSummary.totalAmount || 0)} ({splitSummary.paidCount} paid,{" "}
                    {splitSummary.pendingCount} pending)
                  </p>
                  {(splitSummary.rows || []).map((r) => (
                    <p key={r.userId}>
                      {(r.name || r.userId)}: {formatCurrency(r.amount || 0)} - {r.status}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="group-orders-actions">
                <button onClick={copyInviteMessage} disabled={busy}>
                  Copy Invite
                </button>
                <button
                  onClick={gotoCheckoutForSession}
                  disabled={
                    busy ||
                    selectedSession.status !== "open" ||
                    (isLeader && splitSummary && !splitSummary.allPaid)
                  }
                >
                  Continue to checkout
                </button>
                {isLeader && splitSummary && !splitSummary.allPaid ? (
                  <p className="group-inline-hint">Collect all split payments before checkout.</p>
                ) : null}
                <button
                  onClick={setEqualSplit}
                  disabled={busy || selectedSession.status !== "open" || !isLeader}
                  title={!isLeader ? "Only leader can set split plan" : ""}
                >
                  Set Equal Split ({formatCurrency(splitTotal)})
                </button>
                <button
                  onClick={markMySharePaid}
                  disabled={
                    busy ||
                    selectedSession.status !== "open" ||
                    !myShare ||
                    myShare.paymentStatus === "paid" ||
                    Number(myShare.myShareAmount || 0) <= 0
                  }
                >
                  {myShare?.paymentStatus === "paid" ? "Share Paid" : "Pay My Share"}
                </button>
                <button onClick={leaveSession} disabled={busy || selectedSession.status !== "open"}>
                  Leave
                </button>
                <button
                  onClick={closeSession}
                  disabled={busy || selectedSession.status !== "open" || !isLeader}
                  title={!isLeader ? "Only leader can close session" : ""}
                >
                  Close
                </button>
              </div>
              {selectedSession.splitPlan?.shares?.length ? (
                <div className="group-split-box">
                  <p>Split Plan ({selectedSession.splitPlan.mode})</p>
                  {(selectedSession.splitPlan.shares || []).map((r) => (
                    <p key={r.userId}>
                      {r.userId}: {formatCurrency(r.amount || 0)}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default GroupOrders;
