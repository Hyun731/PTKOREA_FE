"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type ChatMessage = { role: "user" | "ai"; text: string; note?: string | null; links?: { title: string; url: string }[] };

/** A conversation like a chat app: bubbles that scroll, a typing indicator, the input pinned at the bottom. */
export function ChatThread({ messages, busy, onSend, placeholder, starters = [], empty, error }: {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  placeholder: string;
  starters?: string[];
  empty?: ReactNode;
  error?: ReactNode;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);
  // The input grows with what is typed, up to a few lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);
  const send = (t = text) => {
    const message = t.trim();
    if (!message || busy) return;
    setText("");
    onSend(message);
  };
  return (
    <div className="chat">
      <div className="chat-log" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            {empty}
            {starters.length > 0 && (
              <div className="chat-starters">
                {starters.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, k) => (
          <div key={k} className={`chat-msg ${m.role}`}>
            {m.role === "ai" && (
              <span className="chat-avatar" aria-hidden>
                AI
              </span>
            )}
            <div className="chat-bubble">
              {m.note && <div className="chat-note">{m.note}</div>}
              <div className="chat-text">{m.text}</div>
              {(m.links ?? []).length > 0 && (
                <div className="chat-links">
                  {m.links!.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="chat-link">
                      {l.title || new URL(l.url).hostname} ↗
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg ai">
            <span className="chat-avatar" aria-hidden>
              AI
            </span>
            <div className="chat-bubble chat-typing" aria-label="답을 쓰는 중">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      {error}
      <div className="chat-input">
        <textarea
          ref={box}
          rows={1}
          aria-label={placeholder}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="chat-send" disabled={busy || !text.trim()} onClick={() => send()} aria-label="보내기">
          ↑
        </button>
      </div>
    </div>
  );
}
