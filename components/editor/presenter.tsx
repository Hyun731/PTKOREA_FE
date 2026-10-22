"use client";

// Presenter mode: this window shows the script (current slide, next slide, speaker notes, timer);
// a second window (audience) shows only the slide. The two talk over a BroadcastChannel, so the
// audience window can sit on the projector/second display while the presenter drives from here.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./icons";
import { FONT_CSS, SlideView } from "./slide-view";
import type { AssetChoice, EditOut, Slide, Tokens } from "./types";

type Msg =
  | { type: "hello" }
  | { type: "deck"; slides: Slide[]; index: number }
  | { type: "goto"; index: number }
  | { type: "nav"; delta: number }
  | { type: "end" };

export const channelName = (deckId: string) => `ptk-present-${deckId}`;

function useFit(ref: React.RefObject<HTMLElement | null>, tokens: Tokens) {
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.05, Math.min(r.width / tokens.canvas.w, r.height / tokens.canvas.h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, tokens]);
  return scale;
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? `${h}:` : "") + `${String(m).padStart(h ? 2 : 1, "0")}:${String(ss).padStart(2, "0")}`;
}

export function PresenterView({ deckId, slides, start, tokens, assets, onClose }: { deckId: string; slides: Slide[]; start: number; tokens: Tokens; assets: Record<string, AssetChoice>; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [font, setFont] = useState(20);
  const [audience, setAudience] = useState<"none" | "open" | "connected">("none");
  const chan = useRef<BroadcastChannel | null>(null);
  const win = useRef<Window | null>(null);
  const cur = useRef<HTMLDivElement>(null);
  const nxt = useRef<HTMLDivElement>(null);
  const curScale = useFit(cur, tokens);
  const nextScale = useFit(nxt, tokens);
  const idx = useRef(i);
  idx.current = i;

  const go = useCallback((n: number) => setI(Math.max(0, Math.min(slides.length - 1, n))), [slides.length]);

  useEffect(() => {
    const c = new BroadcastChannel(channelName(deckId));
    chan.current = c;
    c.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === "hello") {
        setAudience("connected");
        c.postMessage({ type: "deck", slides, index: idx.current } satisfies Msg);
      } else if (m.type === "nav") setI((n) => Math.max(0, Math.min(slides.length - 1, n + m.delta)));
      else if (m.type === "goto") setI(m.index);
    };
    return () => {
      c.postMessage({ type: "end" } satisfies Msg);
      c.close();
    };
  }, [deckId, slides]);

  useEffect(() => {
    chan.current?.postMessage({ type: "goto", index: i } satisfies Msg);
  }, [i]);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now() - elapsed;
    const t = setInterval(() => setElapsed(Date.now() - t0), 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).isContentEditable) return;
      if (e.key === "Escape") onClose();
      else if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(idx.current + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(idx.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const openAudience = () => {
    const w = window.open(`/editor/${deckId}/audience?i=${i}`, `ptk-audience-${deckId}`, "popup,width=1280,height=760");
    if (w) {
      win.current = w;
      setAudience("open");
    }
  };

  useEffect(() => () => win.current?.close(), []);

  const s = slides[i];
  const next = slides[i + 1];
  const notes = s?.speaker_notes?.trim();

  return (
    <div className="ed-presenter">
      <style>{FONT_CSS}</style>
      <header className="ed-pv-top">
        <div className="ed-pv-timer">
          <span className="ed-pv-time">{clock(elapsed)}</span>
          <button type="button" onClick={() => setRunning((v) => !v)} aria-label={running ? "타이머 일시정지" : "타이머 계속"}>
            {running ? "일시정지" : "계속"}
          </button>
          <button
            type="button"
            onClick={() => {
              setElapsed(0);
              setRunning(true);
            }}
          >
            다시 시작
          </button>
        </div>
        <span className="ed-pv-count">
          {i + 1} <em>/ {slides.length}</em>
        </span>
        <span className="spacer" />
        <span className={`ed-pv-aud ${audience}`}>
          <i aria-hidden />
          {audience === "connected" ? "청중 화면 연결됨" : audience === "open" ? "청중 화면 여는 중" : "청중 화면 없음"}
        </span>
        <button type="button" className="ed-pv-btn" onClick={openAudience}>
          <Icon name="play" size={14} />
          {audience === "none" ? "청중 화면 열기" : "청중 화면 다시 열기"}
        </button>
        <button type="button" className="ed-pv-btn ghost" onClick={onClose}>
          발표 끝내기 · Esc
        </button>
      </header>

      <div className="ed-pv-body">
        <section className="ed-pv-main">
          <div className="ed-pv-label">현재 슬라이드</div>
          <div className="ed-pv-stage" ref={cur}>
            {s && (
              <div className="ed-pv-frame">
                <SlideView slide={s} tokens={tokens} assets={assets} scale={curScale} />
              </div>
            )}
          </div>
          <div className="ed-pv-nav">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="이전 슬라이드">
              <Icon name="back2" size={18} />
            </button>
            <span className="ed-pv-name">{s?.title}</span>
            <button type="button" onClick={() => go(i + 1)} disabled={i >= slides.length - 1} aria-label="다음 슬라이드">
              <Icon name="back2" size={18} style={{ transform: "scaleX(-1)" }} />
            </button>
          </div>
        </section>

        <aside className="ed-pv-side">
          <div className="ed-pv-label">다음 슬라이드</div>
          <div className="ed-pv-next" ref={nxt}>
            {next ? (
              <div className="ed-pv-frame">
                <SlideView slide={next} tokens={tokens} assets={assets} scale={nextScale} />
              </div>
            ) : (
              <div className="ed-pv-end">마지막 슬라이드입니다</div>
            )}
          </div>
          <div className="ed-pv-notes-head">
            <div className="ed-pv-label">발표 대본</div>
            <span className="spacer" />
            <button type="button" onClick={() => setFont((f) => Math.max(12, f - 2))} aria-label="대본 글자 작게">
              A−
            </button>
            <button type="button" onClick={() => setFont((f) => Math.min(40, f + 2))} aria-label="대본 글자 크게">
              A+
            </button>
          </div>
          <div className="ed-pv-notes" style={{ fontSize: font }}>
            {notes ? notes : <span className="ed-pv-empty">이 슬라이드에는 발표자 메모가 없습니다. 편집기 아래 메모 칸에 대본을 적어 두세요.</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Audience window: the slide only, driven by the presenter window. */
export function AudienceView({ deckId, initial }: { deckId: string; initial: number }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [assets, setAssets] = useState<Record<string, AssetChoice>>({});
  const [i, setI] = useState(initial);
  const [ended, setEnded] = useState(false);
  const [size, setSize] = useState({ w: 1280, h: 720 });

  useEffect(() => {
    void (async () => {
      const [m, as, ed] = await Promise.all([
        api.get<{ tokens: Tokens }>(`/meta`),
        api.get<AssetChoice[]>(`/decks/${deckId}/edit/assets`),
        api.get<EditOut>(`/decks/${deckId}/edit`),
      ]);
      setTokens(m.tokens);
      setAssets(Object.fromEntries(as.map((a) => [a.id, a])));
      setSlides((cur) => cur ?? ed.slides); // the presenter's live copy wins if it already arrived
    })();
    const c = new BroadcastChannel(channelName(deckId));
    c.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === "deck") {
        setSlides(m.slides);
        setI(m.index);
        setEnded(false);
      } else if (m.type === "goto") setI(m.index);
      else if (m.type === "end") setEnded(true);
    };
    c.postMessage({ type: "hello" } satisfies Msg);
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(e.key)) c.postMessage({ type: "nav", delta: 1 } satisfies Msg);
      if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) c.postMessage({ type: "nav", delta: -1 } satisfies Msg);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      c.close();
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey);
    };
  }, [deckId]);

  const s = slides?.[i];
  const scale = tokens ? Math.min(size.w / tokens.canvas.w, size.h / tokens.canvas.h) : 1;
  return (
    <div
      className="ed-audience"
      onClick={() => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
      }}
    >
      <style>{FONT_CSS}</style>
      {tokens && s ? <SlideView slide={s} tokens={tokens} assets={assets} scale={scale} /> : <p className="ed-aud-msg">발표자 화면과 연결하는 중…</p>}
      {ended && <p className="ed-aud-msg over">발표가 끝났습니다</p>}
      {!ended && <span className="ed-aud-hint">클릭하면 전체 화면 · 방향키로 넘기기</span>}
    </div>
  );
}
