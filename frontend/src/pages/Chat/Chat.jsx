import React, { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import VoiceInputButton from "../../components/VoiceInputButton/VoiceInputButton";
import "./Chat.css";

const SESSION_KEY = "tomato_agent_session";

const QUICK_PROMPTS = [
  "Where is my latest order?",
  "How do refunds work?",
  "What payment methods are supported?",
  "How do I report a problem with an order?",
  "Tell me about group orders",
];

const Chat = () => {
  const { url, token } = useContext(StoreContext);
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      id: "greeting",
      role: "assistant",
      text: "Hi! I'm the TOMATO assistant. Ask about your orders, payments, disputes, or how to use the app.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY) || "");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!token) {
      navigate("/");
      toast.error("Please sign in to use the assistant");
    }
  }, [token, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const sendMessage = async (text) => {
    const message = String(text || input).trim();
    if (!message || sending || !token) return;

    const userMsg = { id: `${Date.now()}-u`, role: "user", text: message };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await axios.post(
        `${url}/api/chat/agent`,
        { message, sessionId: sessionId || undefined, language: "en" },
        { headers: { token } }
      );
      const data = res.data?.data || res.data;
      if (data?.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }
      const reply = data?.reply || "I could not generate a reply.";
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          text: reply,
          intent: data?.intent,
          confidence: data?.confidence,
          needsVerification: data?.needsVerification,
        },
      ]);
    } catch (err) {
      toast.error(err.response?.data?.message || "Assistant unavailable");
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          text: "Sorry — the assistant is temporarily unavailable. Try again or visit Support.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    localStorage.removeItem(SESSION_KEY);
    setSessionId("");
    setMessages([
      {
        id: "greeting",
        role: "assistant",
        text: "Chat cleared. How can I help you?",
      },
    ]);
  };

  return (
    <div className="chat-page">
      <div className="chat-head">
        <div>
          <h1>TOMATO Assistant</h1>
          <p className="chat-sub">AI help for orders, payments, and app features</p>
        </div>
        <div className="chat-head-actions">
          <button type="button" onClick={clearChat} className="chat-clear-btn">
            Clear chat
          </button>
          <Link to="/support">Human support</Link>
        </div>
      </div>

      <div className="chat-quick">
        {QUICK_PROMPTS.map((q) => (
          <button key={q} type="button" onClick={() => sendMessage(q)} disabled={sending}>
            {q}
          </button>
        ))}
      </div>

      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.role}`}>
            <p>{m.text}</p>
            {m.role === "assistant" && m.needsVerification && (
              <span className="chat-low-confidence">Low confidence — verify in app</span>
            )}
            {m.intent && <span className="chat-intent">{m.intent}</span>}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble--assistant chat-typing">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <VoiceInputButton onTranscript={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))} disabled={sending} />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your food orders…"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
