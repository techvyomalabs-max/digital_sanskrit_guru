import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  CHATBOT_STARTER_REPLIES,
  isChatbotConnected,
  isChatbotEnabled,
  sendChatMessage
} from "../../utils/chatbotClient";
import "./ChatWidget.css";

const STORAGE_KEY = "dsg-chat-conversation";
const GREETING_KEY = "dsg-chat-greeting-shown";
const MAX_INPUT_LENGTH = 500;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function welcomeMessage(name) {
  const firstName = String(name || "").trim().split(/\s+/)[0];
  return {
    id: "welcome",
    role: "bot",
    text: `Namaste${firstName ? ` ${firstName}` : ""}! I'm the Digital Sanskrit Guru assistant. I can help with orders, delivery, digital access and choosing the right product. How can I help you today?`,
    links: [],
    quickReplies: CHATBOT_STARTER_REPLIES,
    time: Date.now()
  };
}

function readStoredConversation() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function formatTime(time) {
  try {
    return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function ChatWidget() {
  const location = useLocation();
  const { user, token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => readStoredConversation() || [welcomeMessage(user?.name)]);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const [showGreeting, setShowGreeting] = useState(false);

  const isAdminRoute = location.pathname.startsWith("/admin");

  // Greeting bubble pops out once per visit, a few seconds after the page loads
  useEffect(() => {
    if (!isChatbotEnabled || isAdminRoute) return undefined;
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(GREETING_KEY) === "1";
    } catch {
      alreadyShown = false;
    }
    if (alreadyShown) return undefined;
    const showTimer = setTimeout(() => setShowGreeting(true), 2500);
    const hideTimer = setTimeout(() => setShowGreeting(false), 14000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [isAdminRoute]);

  useEffect(() => {
    if (!showGreeting) return;
    try {
      sessionStorage.setItem(GREETING_KEY, "1");
    } catch {
      // Without storage the greeting may show again on reload, which is harmless
    }
  }, [showGreeting]);

  const dismissGreeting = () => setShowGreeting(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {
      // Storage can be unavailable (private mode); the chat still works for this visit
    }
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isTyping, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setHasUnread(false);
    setShowGreeting(false);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 120);
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  // Lock page scroll behind the full-screen chat on phones
  useEffect(() => {
    if (!isOpen || !window.matchMedia("(max-width: 768px)").matches) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const sendMessage = useCallback(
    async (rawText) => {
      const text = String(rawText || "").trim().slice(0, MAX_INPUT_LENGTH);
      if (!text || isTyping) return;

      const userMessage = { id: makeId(), role: "user", text, time: Date.now() };
      const conversation = [...messages, userMessage];
      setMessages(conversation);
      setDraft("");
      setIsTyping(true);

      try {
        const reply = await sendChatMessage(conversation, { token, pagePath: location.pathname });
        setMessages((prev) => [
          ...prev,
          { id: makeId(), role: "bot", ...reply, time: Date.now() }
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "bot",
            isError: true,
            text: "Sorry, I couldn't reach the assistant just now. Please try again in a moment.",
            links: [],
            quickReplies: [],
            time: Date.now()
          }
        ]);
      } finally {
        setIsTyping(false);
        if (!isOpen) setHasUnread(true);
      }
    },
    [isOpen, isTyping, location.pathname, messages, token]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(draft);
  };

  const handleInputKeyDown = (event) => {
    // Enter sends; Shift+Enter adds a new line
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage(draft);
    }
  };

  const handleRestart = () => {
    setMessages([welcomeMessage(user?.name)]);
    setDraft("");
    inputRef.current?.focus();
  };

  if (!isChatbotEnabled || isAdminRoute) {
    return null;
  }

  const lastMessage = messages[messages.length - 1];
  const activeQuickReplies =
    !isTyping && lastMessage?.role === "bot" ? lastMessage.quickReplies || [] : [];

  return (
    <div className={`chat-widget${isOpen ? " is-open" : ""}`}>
      {isOpen && (
        <section
          className="chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-panel-title"
        >
          <header className="chat-panel-header">
            <div className="chat-panel-avatar" aria-hidden="true">
              <Bot size={22} />
            </div>
            <div className="chat-panel-heading">
              <h2 id="chat-panel-title">Sanskrit Guru Assistant</h2>
              <span className="chat-panel-status">
                <span className="chat-panel-status-dot" aria-hidden="true" />
                {isChatbotConnected ? "Online · replies instantly" : "Preview mode · sample replies"}
              </span>
            </div>
            <div className="chat-panel-actions">
              <button
                type="button"
                className="chat-icon-btn"
                onClick={handleRestart}
                aria-label="Start a new conversation"
                title="New conversation"
              >
                <RotateCcw size={17} />
              </button>
              <button
                type="button"
                className="chat-icon-btn chat-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                title="Close"
              >
                <X size={19} />
              </button>
            </div>
          </header>

          <div className="chat-panel-body" ref={listRef} aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message chat-message-${message.role}${message.isError ? " is-error" : ""}`}
              >
                {message.role === "bot" && (
                  <div className="chat-message-avatar" aria-hidden="true">
                    <Sparkles size={14} />
                  </div>
                )}
                <div className="chat-message-content">
                  <div className="chat-bubble">
                    <p>{message.text}</p>
                    {Array.isArray(message.links) && message.links.length > 0 && (
                      <div className="chat-bubble-links">
                        {message.links.map((link) =>
                          /^https?:\/\//i.test(link.to) ? (
                            <a key={link.to} href={link.to} target="_blank" rel="noopener noreferrer">
                              {link.label}
                            </a>
                          ) : (
                            <Link key={link.to} to={link.to} onClick={() => setIsOpen(false)}>
                              {link.label}
                            </Link>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  <span className="chat-message-time">{formatTime(message.time)}</span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="chat-message chat-message-bot">
                <div className="chat-message-avatar" aria-hidden="true">
                  <Sparkles size={14} />
                </div>
                <div className="chat-bubble chat-typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {activeQuickReplies.length > 0 && (
            <div className="chat-quick-replies" aria-label="Suggested questions">
              {activeQuickReplies.map((reply) => (
                <button key={reply} type="button" onClick={() => sendMessage(reply)}>
                  {reply}
                </button>
              ))}
            </div>
          )}

          <form className="chat-composer" onSubmit={handleSubmit}>
            <label htmlFor="chat-composer-input" className="chat-visually-hidden">
              Type your message
            </label>
            <textarea
              id="chat-composer-input"
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={MAX_INPUT_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your question…"
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!draft.trim() || isTyping}
              aria-label="Send message"
            >
              <SendHorizontal size={19} />
            </button>
          </form>
          <p className="chat-panel-footnote">
            Automated assistant. For order-specific help, contact our Customer Seva Team.
          </p>
        </section>
      )}

      {!isOpen && (
        <div className="chat-launcher-wrap">
          {showGreeting && (
            <div className="chat-greeting" role="status">
              <button
                type="button"
                className="chat-greeting-text"
                onClick={() => setIsOpen(true)}
              >
                <strong>Namaste!</strong>
                <span>Ask me anything about our books & courses</span>
              </button>
              <button
                type="button"
                className="chat-greeting-close"
                onClick={dismissGreeting}
                aria-label="Dismiss message"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            className="chat-launcher"
            onClick={() => setIsOpen(true)}
            aria-label="Open chat assistant"
            title="Ask us"
          >
            <span className="chat-launcher-ring" aria-hidden="true" />
            <span className="chat-launcher-ring chat-launcher-ring-2" aria-hidden="true" />
            <Bot size={30} className="chat-launcher-icon" />
            {hasUnread && <span className="chat-launcher-badge" aria-label="New reply" />}
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatWidget;
