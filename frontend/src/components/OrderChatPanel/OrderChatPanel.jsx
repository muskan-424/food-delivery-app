import React, { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import "./OrderChatPanel.css";

const POLL_MS = 5000;

const OrderChatPanel = ({ orderId, orderStatus }) => {
  const { url, token } = useContext(StoreContext);
  const [messages, setMessages] = useState([]);
  const [viewerRole, setViewerRole] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const bottomRef = useRef(null);

  const loadMessages = async (silent = false) => {
    if (!token || !orderId) return;
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${url}/api/order-chat/${orderId}/messages`, {
        headers: { token },
      });
      if (res.data?.success) {
        setMessages(res.data.data?.messages || []);
        setViewerRole(res.data.data?.viewerRole || "");
        setDisabled(false);
      }
    } catch (err) {
      if (err.response?.status === 503) {
        setDisabled(true);
      } else if (!silent) {
        toast.error(err.response?.data?.message || "Could not load chat");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
    const id = setInterval(() => loadMessages(true), POLL_MS);
    return () => clearInterval(id);
  }, [orderId, token, url]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await axios.post(
        `${url}/api/order-chat/${orderId}/messages`,
        { body },
        { headers: { token } }
      );
      if (res.data?.success) {
        setText("");
        await loadMessages(true);
      } else {
        toast.error(res.data?.message || "Could not send message");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not send message");
    } finally {
      setSending(false);
    }
  };

  if (disabled) {
    return (
      <div className="order-chat-panel order-chat-panel--disabled">
        <p>Order chat is not enabled on this server.</p>
      </div>
    );
  }

  if (orderStatus === "cancelled") {
    return (
      <div className="order-chat-panel order-chat-panel--disabled">
        <p>Chat is closed for cancelled orders.</p>
      </div>
    );
  }

  return (
    <div className="order-chat-panel">
      <div className="order-chat-head">
        <strong>Order chat</strong>
        {viewerRole && <span className="order-chat-role">You: {viewerRole}</span>}
      </div>
      <div className="order-chat-messages">
        {loading && messages.length === 0 ? (
          <p className="order-chat-muted">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="order-chat-muted">No messages yet. Say hello to the restaurant or delivery partner.</p>
        ) : (
          messages.map((m) => (
            <div key={m._id} className={`order-chat-msg order-chat-msg--${m.senderRole || "unknown"}`}>
              <span className="order-chat-msg-role">{m.senderRole || "user"}</span>
              <p>{m.body}</p>
              <time>{new Date(m.createdAt).toLocaleString()}</time>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form className="order-chat-form" onSubmit={sendMessage}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={4000}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
};

export default OrderChatPanel;
