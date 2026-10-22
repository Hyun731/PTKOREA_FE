"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { AiOut, Area, EditLogEntry, Scope } from "./types";

export type ChatMsg =
  | { id: string; role: "user"; text: string; scope: Scope; context: string }
  | { id: string; role: "ai"; text: string; mode: "claude" | "mock"; result?: AiOut; status: "pending" | "applied" | "cancelled" | "empty" | "error"; areaIds?: string[] };

const SCOPE_LABEL: Record<Scope, string> = { selection: "선택 영역", slide: "현재 슬라이드", deck: "전체 슬라이드" };
const OP_LABEL: Record<string, string> = {
  update_text: "텍스트",
  update_style: "스타일",
  move_element: "이동",
  resize_element: "크기",
  add_element: "추가",
  delete_element: "삭제",
  reorder_elements: "순서",
  update_background: "배경",
  restructure_layout: "레이아웃",
  update_notes: "메모",
  rename_slide: "이름",
};
const EXAMPLES = ["제목 글씨를 조금 키우고 파란색으로 바꿔줘", "이 슬라이드를 더 깔끔하게 정리해 줘", "이 영역의 내용을 세 줄로 요약해 줘", "선택한 두 요소를 좌우로 바꿔줘", "전체 슬라이드의 제목 디자인을 통일해 줘", "이 슬라이드 발표 대본 써줘"];

export function AiPanel({
  slideNo,
  slideTitle,
  selectedCount,
  areas,
  areaSlides,
  scope,
  autoScope,
  onScope,
  modes,
  mode,
  onMode,
  messages,
  busy,
  error,
  onSend,
  onApply,
  onCancel,
  onAreaMode,
  areaMode,
  onClearSelection,
  onFocusTarget,
  log,
  slideNoOf,
  onRestore,
  busyLog,
}: {
  slideNo: number;
  slideTitle: string;
  selectedCount: number;
  areas: Area[];
  areaSlides: number;
  scope: Scope;
  autoScope: boolean;
  onScope: (s: Scope | null) => void;
  modes: ("claude" | "mock")[];
  mode: "claude" | "mock";
  onMode: (m: "claude" | "mock") => void;
  messages: ChatMsg[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onApply: (id: string) => void;
  onCancel: (id: string) => void;
  onAreaMode: () => void;
  areaMode: boolean;
  onClearSelection: () => void;
  onFocusTarget: (slideId: string, elementId: string | null) => void;
  log: EditLogEntry[];
  slideNoOf: (slideId: string) => number;
  onRestore: (entry: EditLogEntry, to: "after" | "before") => void;
  busyLog: boolean;
}) {
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"chat" | "log">("chat");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);
  const pending = messages.some((m) => m.role === "ai" && m.status === "pending");
  const send = () => {
    const t = text.trim();
    if (!t || busy || pending) return;
    onSend(t);
    setText("");
  };
  const hasSelection = selectedCount > 0 || areas.length > 0;

  return (
    <aside className="ed-ai" aria-label="AI 편집 도우미">
      <header className="ed-ai-head">
        <span className="ed-ai-mark" aria-hidden>
          <Icon name="sparkle" size={16} />
        </span>
        <div className="ed-ai-title">
          <strong>AI 편집</strong>
          <span>{mode === "mock" ? "Mock · 규칙 기반, 모델 호출 없음" : "Claude · 편집 명령으로 수정"}</span>
        </div>
        <span className="spacer" />
        <div className="ed-seg sm" role="radiogroup" aria-label="AI 모드">
          {(["claude", "mock"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={!modes.includes(m)} className={mode === m ? "on" : ""} onClick={() => onMode(m)}>
              {m === "claude" ? "Claude" : "Mock"}
            </button>
          ))}
        </div>
      </header>
      <div className="ed-ai-tabs" role="tablist" aria-label="AI 패널">
        <button type="button" role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
          대화
        </button>
        <button type="button" role="tab" aria-selected={tab === "log"} className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>
          기록 <span className="ed-count">{log.filter((e) => e.status !== "proposed").length}</span>
        </button>
      </div>
      {tab === "log" ? (
        <HistoryList log={log} slideNoOf={slideNoOf} onRestore={onRestore} onFocus={(sid) => onFocusTarget(sid, null)} disabled={busyLog} />
      ) : (
      <>
      <section className="ed-ai-ctx" aria-label="편집 대상">
        <div className="ed-ctx-card">
          <div className="ed-ctx-top">
            <span className="ed-ctx-no">{slideNo}</span>
            <span className="ed-ctx-title">{slideTitle}</span>
          </div>
          <div className="ed-ctx-tags">
            <span className={`ed-tag ${selectedCount ? "on" : ""}`}>요소 {selectedCount}</span>
            <span className={`ed-tag ${areas.length ? "on area" : ""}`}>
              영역 {areas.length}
              {areaSlides > 1 ? ` · ${areaSlides}장` : ""}
            </span>
            <span className="spacer" />
            <button type="button" className={`ed-btn xs ${areaMode ? "on" : "ghost"}`} onClick={onAreaMode} aria-pressed={areaMode}>
              <Icon name="area" size={14} />
              영역 지정
            </button>
            <button type="button" className="ed-btn xs ghost" onClick={onClearSelection} disabled={!hasSelection}>
              초기화
            </button>
          </div>
        </div>
        <div className="ed-scope" role="radiogroup" aria-label="수정 범위">
          {(["selection", "slide", "deck"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} className={scope === s ? "on" : ""} disabled={s === "selection" && !hasSelection} onClick={() => onScope(s === scope && !autoScope ? null : s)}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="ed-scope-note">{autoScope ? "범위 자동 · " : ""}{scope === "selection" ? "선택한 요소와 영역만 고칩니다" : scope === "slide" ? "현재 슬라이드 전체를 고칩니다" : "모든 슬라이드에 적용합니다"}</p>
      </section>

      <div className="ed-ai-list" ref={list}>
        {messages.length === 0 && (
          <div className="ed-ai-empty">
            <p>고칠 부분을 선택하거나 영역으로 지정한 뒤, 원하는 수정을 말로 요청하세요.</p>
            <div className="ed-examples">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => setText(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ed-msg user">
              <div className="ed-bubble">{m.text}</div>
              <div className="ed-msg-meta">
                {SCOPE_LABEL[m.scope]} · {m.context}
              </div>
            </div>
          ) : (
            <div key={m.id} className={`ed-msg ai ${m.status}`}>
              <div className="ed-msg-meta">
                <Icon name="sparkle" size={12} />
                {m.mode === "mock" ? "Mock" : "Claude"}
                {m.status === "applied" && <span className="ed-status ok">적용됨</span>}
                {m.status === "cancelled" && <span className="ed-status">취소됨</span>}
                {m.status === "pending" && <span className="ed-status live">미리보기</span>}
                {m.result?.log_id && <span className="ed-log-id small">#{m.result.log_id.split("-")[1]?.slice(0, 7)}</span>}
                {m.result?.usage ? <span className="ed-cost">${m.result.usage.cost_usd.toFixed(3)}</span> : null}
              </div>
              <div className="ed-card">
                <p className="ed-reply">{m.text}</p>
                {m.result && m.result.applied.length > 0 && (
                  <ul className="ed-changes">
                    {m.result.applied.map((a) => (
                      <li key={a.index}>
                        <button type="button" onClick={() => onFocusTarget(a.slide_id, a.element_id)}>
                          <span className="ed-op">{OP_LABEL[a.op] ?? a.op}</span>
                          <span className="ed-sum">{a.summary}</span>
                          <span className="ed-target">{a.element_id ?? a.slide_id}</span>
                        </button>
                        {a.reason && <div className="ed-why">{a.reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
                {m.result && m.result.rejected.length > 0 && (
                  <ul className="ed-rejected">
                    {m.result.rejected.map((r, i) => (
                      <li key={i}>
                        <Icon name="alert" size={13} />
                        <span>
                          {r.element_id ?? r.op} — {r.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {m.status === "pending" && m.result && (
                  <div className="ed-card-foot">
                    {m.result.qc && (
                      <span className={`ed-qc-note ${m.result.qc.blocks ? "bad" : ""}`}>
                        <Icon name={m.result.qc.blocks ? "alert" : "shield"} size={13} />
                        적용 후 차단 {m.result.qc.blocks} · 경고 {m.result.qc.warns}
                      </span>
                    )}
                    <span className="spacer" />
                    <button type="button" className="ed-btn sm ghost" onClick={() => onCancel(m.id)}>
                      취소
                    </button>
                    <button type="button" className="ed-btn sm primary" onClick={() => onApply(m.id)}>
                      <Icon name="check" size={14} />
                      적용
                    </button>
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="ed-msg ai">
            <div className="ed-card ed-typing">
              <span className="ed-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              수정안을 만드는 중
            </div>
          </div>
        )}
        {error && <div className="ed-error">{error}</div>}
      </div>

      <form
        className="ed-ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="ed-composer">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={pending ? "미리보기를 적용하거나 취소한 뒤 이어서 요청하세요" : hasSelection ? "선택한 부분을 어떻게 바꿀까요?" : "이 슬라이드를 어떻게 바꿀까요?"}
            rows={3}
            disabled={busy || pending}
            aria-label="AI에게 수정 요청"
          />
          <div className="ed-composer-foot">
            <span className="ed-hint">Enter 보내기 · Shift+Enter 줄바꿈</span>
            <button type="submit" className="ed-send" disabled={!text.trim() || busy || pending} aria-label="보내기">
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
      </form>
      </>
      )}
    </aside>
  );
}

const KIND: Record<EditLogEntry["kind"], string> = { ai: "AI 수정", restore: "되돌리기", reset: "초안으로" };
const STATUS: Record<EditLogEntry["status"], string> = { proposed: "미리보기", applied: "적용", cancelled: "취소" };

function when(iso: string) {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  const today = new Date();
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === today.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function HistoryList({ log, slideNoOf, onRestore, onFocus, disabled }: { log: EditLogEntry[]; slideNoOf: (sid: string) => number; onRestore: (e: EditLogEntry, to: "after" | "before") => void; onFocus: (sid: string) => void; disabled: boolean }) {
  const rows = log.filter((e) => e.status !== "proposed");
  if (!rows.length)
    return (
      <div className="ed-ai-list">
        <p className="ed-hint">아직 기록이 없습니다. AI 수정안을 적용하거나 취소하면 여기에 남고, 적용한 시점으로 언제든 되돌릴 수 있습니다.</p>
      </div>
    );
  return (
    <div className="ed-ai-list">
      <ol className="ed-log">
        {rows.map((e) => (
          <li key={e.id} className={`ed-log-item ${e.kind} ${e.status}`}>
            <div className="ed-log-head">
              <button type="button" className="ed-log-id" title="기록 번호 — 눌러서 복사" onClick={() => void navigator.clipboard?.writeText(e.short)}>
                #{e.short}
              </button>
              <span className={`ed-log-kind ${e.kind}`}>{KIND[e.kind]}</span>
              <span className={`ed-status ${e.status === "applied" ? "ok" : ""}`}>{STATUS[e.status]}</span>
              {e.mode && <span className="ed-hint">{e.mode === "claude" ? "Claude" : "Mock"}</span>}
              <span className="spacer" />
              <time className="ed-hint">{when(e.created_at)}</time>
            </div>
            <p className="ed-log-msg">{e.restored_from_short ? e.message.replace(`#${e.restored_from_short} `, "") : e.message}</p>
            {e.restored_from_short && <div className="ed-log-from">← #{e.restored_from_short} 기준</div>}
            {e.slide_ids.length > 0 && (
              <div className="ed-log-slides">
                {e.slide_ids.slice(0, 8).map((sid) => {
                  const n = slideNoOf(sid);
                  return (
                    <button key={sid} type="button" onClick={() => onFocus(sid)} disabled={n <= 0} title={sid}>
                      {n > 0 ? `${n}번` : sid}
                    </button>
                  );
                })}
                {e.slide_ids.length > 8 && <span className="ed-hint">외 {e.slide_ids.length - 8}장</span>}
                <span className="ed-hint">· 변경 {e.applied.length}건{e.cost_usd ? ` · $${e.cost_usd.toFixed(3)}` : ""}</span>
              </div>
            )}
            {(e.can_restore_after || e.can_restore_before) && (
              <div className="ed-log-actions">
                {e.can_restore_after && (
                  <button type="button" className="ed-btn xs ghost" disabled={disabled} onClick={() => onRestore(e, "after")} title="이 변경이 적용된 직후의 편집본으로">
                    이 시점으로
                  </button>
                )}
                {e.can_restore_before && (
                  <button type="button" className="ed-btn xs ghost" disabled={disabled} onClick={() => onRestore(e, "before")} title="이 변경 직전의 편집본으로">
                    이 변경 전으로
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
