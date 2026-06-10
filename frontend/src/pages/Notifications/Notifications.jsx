import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import {
  filterNotifications,
  formatNotificationTime,
  normalizeNotification,
  NOTIFICATION_TABS,
  PREF_CATEGORIES,
  PREF_CHANNELS,
} from "../../utils/notifications";
import "./Notifications.css";

const Notifications = () => {
  const { url, token } = useContext(StoreContext);
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const esRef = useRef(null);

  const loadInbox = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get(`${url}/api/notifications/inbox?limit=50`, {
        headers: { token },
      });
      if (res.data?.success) {
        const rows = (res.data.items || []).map(normalizeNotification).filter(Boolean);
        setItems(rows);
        setUnreadCount(Number(res.data.unreadCount) || 0);
      }
    } catch {
      toast.error("Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [token, url]);

  const loadPrefs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${url}/api/notifications/preferences`, {
        headers: { token },
      });
      if (res.data?.success) setPrefs(res.data.data || {});
    } catch {
      setPrefs(null);
    }
  }, [token, url]);

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    loadInbox();
    loadPrefs();
  }, [token, navigate, loadInbox, loadPrefs]);

  useEffect(() => {
    if (!token) return undefined;
    const streamUrl = `${url}/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(streamUrl);
    esRef.current = es;

    es.onopen = () => setLiveConnected(true);
    es.onerror = () => setLiveConnected(false);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "connected") {
          setLiveConnected(true);
          return;
        }
        const payload = msg.data || msg;
        const item = normalizeNotification(payload);
        if (item?.id) {
          setItems((prev) => {
            if (prev.some((n) => n.id === item.id)) return prev;
            return [item, ...prev].slice(0, 100);
          });
          if (!item.read) setUnreadCount((c) => c + 1);
        }
      } catch {
        /* ignore malformed SSE */
      }
    };

    return () => {
      es.close();
      esRef.current = null;
      setLiveConnected(false);
    };
  }, [token, url]);

  const markRead = async (id) => {
    try {
      await axios.patch(`${url}/api/notifications/${id}/read`, {}, { headers: { token } });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error("Could not mark as read");
    }
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${url}/api/notifications/read-all`, {}, { headers: { token } });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked read");
    } catch {
      toast.error("Could not update notifications");
    }
  };

  const togglePref = async (category, channel) => {
    if (!prefs?.[category]) return;
    const next = {
      ...prefs,
      [category]: {
        ...prefs[category],
        [channel]: !prefs[category][channel],
      },
    };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await axios.put(
        `${url}/api/notifications/preferences`,
        { categories: { [category]: next[category] } },
        { headers: { token } }
      );
    } catch {
      toast.error("Could not save preferences");
      loadPrefs();
    } finally {
      setSavingPrefs(false);
    }
  };

  const visible = filterNotifications(items, tab);

  return (
    <div className="notifications-page">
      <div className="notifications-head">
        <div>
          <h1>Notifications</h1>
          <p className="notifications-sub">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            <span className={`notifications-live ${liveConnected ? "on" : ""}`}>
              {liveConnected ? "Live" : "Offline"}
            </span>
          </p>
        </div>
        <div className="notifications-head-actions">
          <button type="button" className="notifications-prefs-btn" onClick={() => setPrefsOpen((v) => !v)}>
            Preferences
          </button>
          {unreadCount > 0 && (
            <button type="button" className="notifications-mark-all" onClick={markAllRead}>
              Mark all read
            </button>
          )}
          <Link to="/myorders" className="notifications-back">
            Back to orders
          </Link>
        </div>
      </div>

      {prefsOpen && prefs && (
        <div className="notifications-prefs-panel">
          <h3>Notification preferences</h3>
          {savingPrefs && <p className="notifications-prefs-saving">Saving…</p>}
          <div className="notifications-prefs-grid">
            {PREF_CATEGORIES.map((cat) => (
              <div key={cat.id} className="notifications-prefs-row">
                <span className="notifications-prefs-label">{cat.label}</span>
                {PREF_CHANNELS.map((ch) => (
                  <label key={ch.id} className="notifications-prefs-check">
                    <input
                      type="checkbox"
                      checked={!!prefs[cat.id]?.[ch.id]}
                      onChange={() => togglePref(cat.id, ch.id)}
                    />
                    {ch.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="notifications-tabs">
        {NOTIFICATION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="notifications-loading">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="notifications-empty">No notifications in this tab.</p>
      ) : (
        <ul className="notifications-list">
          {visible.map((n) => (
            <li key={n.id} className={n.read ? "read" : "unread"}>
              <div className="notifications-item-main">
                <strong>{n.title}</strong>
                <span className="notifications-time">{formatNotificationTime(n.createdAt)}</span>
              </div>
              {n.body && <p className="notifications-body">{n.body}</p>}
              <div className="notifications-item-footer">
                <span className="notifications-badge">{n.categoryLabel}</span>
                {!n.read && (
                  <button type="button" onClick={() => markRead(n.id)}>
                    Mark read
                  </button>
                )}
                {n.refType === "order" && n.refId && (
                  <Link to="/myorders">View order</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Notifications;
