"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ApiError, Part } from "@/lib/api";

/* ------------------------------------------------------------------ toast (aria-live) */

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------------ alerts */

export function ErrorBox({ error }: { error: ApiError | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <span className="ic" aria-hidden>
        !
      </span>
      <div className="body">
        <strong>{error.message}</strong>
        {error.action && <span className="action">→ {error.action}</span>}
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode }) {
  const ic = { info: "i", warn: "!", ok: "✓", error: "!" }[tone];
  return (
    <div className={`alert ${tone}`}>
      <span className="ic" aria-hidden>
        {ic}
      </span>
      <div className="body">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ status badges: icon + text, never color alone */

const STATUS: Record<string, [string, string, string]> = {
  candidate: ["검토 전", "b-neutral", "○"],
  pending: ["검토 전", "b-neutral", "○"],
  accepted: ["채택", "b-ok", "✓"],
  eligible: ["확인됨", "b-ok", "✓"],
  excluded: ["제외", "b-bad", "✕"],
  rejected: ["제외", "b-bad", "✕"],
  replaced: ["교체됨", "b-outline", "↺"],
  stale: ["재검토 필요", "b-warn", "!"],
  ready: ["생성 가능", "b-ok", "✓"],
  needs_input: ["자료 없어 빠짐", "b-outline", "–"],
  omitted: ["생략", "b-outline", "–"],
  not_started: ["미실행", "b-outline", "○"],
  queued: ["대기 중", "b-brand", "…"],
  running: ["진행 중", "b-brand", "…"],
  succeeded: ["완료", "b-ok", "✓"],
  failed: ["실패", "b-bad", "✕"],
  cancelled: ["취소", "b-outline", "–"],
  partial: ["일부 완료", "b-warn", "!"],
  needs_review: ["확인 필요", "b-warn", "!"],
  blocked_budget: ["예산 도달", "b-warn", "!"],
  superseded: ["대체됨", "b-outline", "–"],
  key_missing: ["키 미설정", "b-warn", "!"],
  manual_only: ["직접 입력", "b-neutral", "✎"],
  ready_auto: ["자동 수집 가능", "b-ok", "✓"],
  ok: ["실제 렌더 확인", "b-ok", "✓"],
  unavailable: ["렌더러 없음", "b-warn", "!"],
  block: ["차단", "b-bad", "✕"],
  warn: ["확인 필요", "b-warn", "!"],
};

export function Status({ value, label }: { value: string; label?: string }) {
  const [text, cls, ic] = STATUS[value] ?? [value, "b-neutral", "•"];
  return (
    <span className={`badge ${cls}`}>
      <span className="ic" aria-hidden>
        {ic}
      </span>
      {label ?? text}
    </span>
  );
}

export const KIND_LABEL: Record<string, [string, string, string]> = {
  fact: ["사실", "b-brand", "원문에서 확인한 활동"],
  interpretation: ["해석", "b-warn", "근거 범위 안의 시사점"],
  recommendation: ["기획자 의견", "b-neutral", "근거와 별도로 표시"],
};

export function Kind({ kind, author }: { kind: string; author?: string }) {
  const [label, cls] = KIND_LABEL[kind] ?? [kind, "b-neutral"];
  return (
    <span className={`badge ${cls}`}>
      {label}
      {author === "ai" ? " · AI 후보" : ""}
    </span>
  );
}

/** Typed parts: bound numbers are highlighted so a reviewer sees what traces to a Fact. */
export function Parts({ parts }: { parts: Part[] }) {
  return (
    <span className="parts">
      {parts.map((p, i) =>
        p.type === "fact" ? (
          <mark key={i} className="fact" title="근거 수치에 연결됨">
            {p.display}
          </mark>
        ) : p.type === "link" && p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer">
            {p.text}
          </a>
        ) : (
          <span key={i} className={p.type === "name" ? "name" : p.type === "date" ? "date" : undefined}>
            {p.text}
          </span>
        ),
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ dialog with focus trap */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, subtitle, onClose, children, footer, variant = "side", badge, wide }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; variant?: "side" | "center"; badge?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="dialog-back" onClick={onClose} aria-hidden />
      <div ref={ref} className={`dialog ${variant === "center" ? "center" : ""} ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-head">
          <div className="grow">
            {subtitle && <div className="small muted">{subtitle}</div>}
            <h2 id={titleId}>{title}</h2>
          </div>
          {badge}
          <button className="btn sm" onClick={onClose} aria-label="닫기">
            닫기 ✕
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/** Exclusion / omission always needs a reason (PRD 4, Q02): a labelled dialog, not a bare input. */
export function ReasonButton({ label, title, help, onSubmit, danger, disabled, className = "", sm = true, placeholder }: { label: string; title?: string; help?: string; onSubmit: (reason: string) => void | Promise<void>; danger?: boolean; disabled?: boolean; className?: string; sm?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const id = useId();
  const ok = reason.trim().length >= 2;
  return (
    <>
      <button className={`btn ${sm ? "sm" : ""} ${danger ? "danger" : ""} ${className}`} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Dialog
          variant="center"
          title={title ?? label}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                취소
              </button>
              <button
                className={`btn ${danger ? "danger" : "primary"}`}
                disabled={!ok}
                onClick={async () => {
                  await onSubmit(reason.trim());
                  setOpen(false);
                  setReason("");
                }}
              >
                {label}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="label" htmlFor={id}>
              사유<span className="req">*</span>
            </label>
            <textarea id={id} data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder ?? "다른 사람이 이해할 수 있게 짧게"} aria-describedby={`${id}-h`} />
            <span id={`${id}-h`} className="help">
              {help ?? "사유는 검토 이력과 빌드 리포트에 남습니다."}
            </span>
          </div>
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ form bits */

export function Field({ label, help, required, error, children, className = "", impact: impactKey, row }: { label: string; help?: ReactNode; required?: boolean; error?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string; impact?: string; row?: boolean }) {
  const id = useId();
  const helpId = help || error ? `${id}-help` : undefined;
  const labelEl = (
    <label className="label" htmlFor={id}>
      {label}
      {required && (
        <span className="req" aria-hidden>
          *
        </span>
      )}
    </label>
  );
  const notes = (
    <span id={helpId} className="notes">
      {error ? <span className="err">{error}</span> : help ? <span className="help">{help}</span> : null}
    </span>
  );
  if (row)
    return (
      <div className={`frow ${className}`} data-impact={impactKey}>
        <div className="frow-label">{labelEl}</div>
        <div className="frow-control">
          {children(id, helpId)}
          {notes}
        </div>
      </div>
    );
  return (
    <div className={`field ${className}`} data-impact={impactKey}>
      {labelEl}
      {children(id, helpId)}
      {notes}
    </div>
  );
}

/** Keyboard-reachable file picker (a real button that opens a hidden input). */
export function FileButton({ label, accept, onFile, disabled, primary }: { label: string; accept: string; onFile: (f: File) => void; disabled?: boolean; primary?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={`btn ${primary ? "primary" : ""}`} onClick={() => ref.current?.click()} disabled={disabled}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function Stat({ k, v, tone }: { k: string; v: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <div className="v num">{v}</div>
      <div className="k">{k}</div>
    </div>
  );
}

export function PageIntro({ title, step, children, actions }: { title: string; step?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="intro">
      <div className="grow">
        {step && <div className="step-no">{step}</div>}
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="btn-group">{actions}</div>}
    </div>
  );
}

export function Checklist({ items }: { items: { done: boolean; text: ReactNode }[] }) {
  return (
    <ul className="checklist">
      {items.map((it, i) => (
        <li key={i} className={it.done ? "done" : "todo"}>
          <span className="mark" aria-hidden>
            {it.done ? "✓" : i + 1}
          </span>
          <span className="text">
            <span className="sr-only">{it.done ? "완료: " : "남음: "}</span>
            {it.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d.slice(0, 10).replaceAll("-", ".");
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  const t = new Date(d);
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
