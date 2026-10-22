"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, ApiError, fileUrl, API_URL } from "@/lib/api";
import { AiPanel, type ChatMsg } from "./ai-panel";
import { Canvas, type Tool } from "./canvas";
import {
  blankSlide, clampRegion, duplicateSlide, mapBlocks, mapSlide, newBlockId, scaleText, setRegions, setTextColor, setWeight, shapeBox, slideLabel, textBox,
} from "./ops";
import { Icon, type IconName } from "./icons";
import { PresenterView } from "./presenter";
import { FONT_CSS, SlideView, colorOf } from "./slide-view";
import type { AiOut, Area, AssetChoice, Block, EditLogEntry, EditOut, EParagraph, QC, Region, Scope, Slide, TextBlock, Tokens, Weight } from "./types";

// ------------------------------------------------------------------ history

type Doc = { slides: Slide[]; title: string };
type Hist = { doc: Doc; past: Doc[]; future: Doc[]; rev: number };
type HAction = { t: "commit"; doc: Doc } | { t: "apply"; fn: (d: Doc) => Doc } | { t: "undo" } | { t: "redo" } | { t: "reset"; doc: Doc };
const LIMIT = 100;

function hist(s: Hist, a: HAction): Hist {
  switch (a.t) {
    case "commit":
      return { doc: a.doc, past: [...s.past, s.doc].slice(-LIMIT), future: [], rev: s.rev + 1 };
    case "apply": {
      // Applied to the latest state (late commits from unmounting fields must not use a stale copy).
      const doc = a.fn(s.doc);
      return doc === s.doc ? s : { doc, past: [...s.past, s.doc].slice(-LIMIT), future: [], rev: s.rev + 1 };
    }
    case "undo":
      if (!s.past.length) return s;
      return { doc: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.doc, ...s.future], rev: s.rev + 1 };
    case "redo":
      if (!s.future.length) return s;
      return { doc: s.future[0], past: [...s.past, s.doc], future: s.future.slice(1), rev: s.rev + 1 };
    case "reset":
      return { doc: a.doc, past: [], future: [], rev: 0 };
  }
}

const COLOR_CHOICES = ["text", "navy", "subtle", "muted", "white", "red", "gold", "green", "link", "tint", "pale", "slate"];
const WEIGHTS: [Weight, string][] = [
  ["light", "얇게"],
  ["regular", "보통"],
  ["semibold", "중간"],
  ["bold", "굵게"],
  ["heavy", "아주 굵게"],
];
type SaveState = "saved" | "dirty" | "saving" | "error";

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
}

// ------------------------------------------------------------------ editor

export function DeckEditor({ deckId }: { deckId: string }) {
  const [meta, setMeta] = useState<EditOut | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [assets, setAssets] = useState<AssetChoice[]>([]);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [h, dispatch] = useReducer(hist, { doc: { slides: [], title: "" }, past: [], future: [], rev: 0 });
  const [cur, setCur] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [areas, setAreas] = useState<Record<string, Area[]>>({});
  const [tool, setTool] = useState<Tool>("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(0.6);
  const [qc, setQc] = useState<QC | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [mode, setMode] = useState<"claude" | "mock">("mock");
  const [scopePick, setScopePick] = useState<Scope | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [present, setPresent] = useState<number | null>(null);
  const [presenter, setPresenter] = useState<number | null>(null);
  const [presentMenu, setPresentMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [qcOpen, setQcOpen] = useState(false);
  const [log, setLog] = useState<EditLogEntry[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ tone: "ok" | "bad"; text: string; href?: string } | null>(null);
  const version = useRef(0);
  const savedRev = useRef(0);
  const saving = useRef<Promise<void> | null>(null);

  const slides = h.doc.slides;
  const assetMap = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a])), [assets]);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [m, metaOut, as] = await Promise.all([
          api.get<EditOut>(`/decks/${deckId}/edit`),
          api.get<{ tokens: Tokens }>(`/meta`),
          api.get<AssetChoice[]>(`/decks/${deckId}/edit/assets`),
        ]);
        if (!alive) return;
        setMeta(m);
        setTokens(metaOut.tokens);
        setAssets(as);
        version.current = m.edit_version;
        dispatch({ t: "reset", doc: { slides: m.slides, title: m.title } });
        setCur(m.slides[0]?.slide_id ?? "");
        setQc(m.qc);
        setMode(m.ai.available ? "claude" : "mock");
        try {
          const raw = localStorage.getItem(`ptk-editor-chat-${deckId}`);
          if (raw) setMessages((JSON.parse(raw) as ChatMsg[]).map((x) => (x.role === "ai" && x.status === "pending" ? { ...x, status: "cancelled" } : x)));
        } catch {
          /* no stored chat */
        }
      } catch (e) {
        if (alive) setLoadError(e as ApiError);
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId]);

  useEffect(() => {
    try {
      localStorage.setItem(`ptk-editor-chat-${deckId}`, JSON.stringify(messages.slice(-60).map((m) => (m.role === "ai" && m.result ? { ...m, result: { ...m.result, slides: [] } } : m))));
    } catch {
      /* storage full or blocked */
    }
  }, [messages, deckId]);

  // Keep the current slide's thumbnail in view (selection can change from the AI panel or keys).
  useEffect(() => {
    document.querySelector(".ed-thumbs li.on")?.scrollIntoView({ block: "nearest" });
  }, [cur]);

  const reloadLog = useCallback(async () => {
    try {
      setLog(await api.get<EditLogEntry[]>(`/decks/${deckId}/edit/log`));
    } catch {
      /* the history is informational; the editor keeps working without it */
    }
  }, [deckId]);
  useEffect(() => {
    void reloadLog();
  }, [reloadLog]);

  // ---------------------------------------------------------------- fit zoom
  // Callback ref: the stage mounts only after data loads, so observe it when it appears.
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!stageEl || !tokens) return;
    const fit = () => {
      const r = stageEl.getBoundingClientRect();
      setFitScale(Math.max(0.15, Math.min((r.width - 64) / tokens.canvas.w, (r.height - 64) / tokens.canvas.h)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl, tokens]);
  const scale = zoom === "fit" ? fitScale : zoom;

  // ---------------------------------------------------------------- save
  const doSave = useCallback(async () => {
    if (h.rev === savedRev.current) return;
    const rev = h.rev;
    setSave("saving");
    try {
      const out = await api.put<{ edit_version: number; qc: QC }>(`/decks/${deckId}/edit`, { base_version: version.current, slides: h.doc.slides, title: h.doc.title });
      version.current = out.edit_version;
      savedRev.current = rev;
      setQc(out.qc);
      setSaveError(null);
      setSave((s) => (rev === h.rev ? "saved" : s === "saving" ? "dirty" : s));
    } catch (e) {
      const err = e as ApiError;
      setSave("error");
      setSaveError(err.code === "STALE_VERSION" ? "다른 창에서 이 편집본이 바뀌었습니다. 새로고침해 최신본을 불러오세요." : err.message);
    }
  }, [h, deckId]);

  useEffect(() => {
    if (!meta || h.rev === savedRev.current) return;
    setSave("dirty");
    const t = setTimeout(() => {
      saving.current = doSave();
    }, 900);
    return () => clearTimeout(t);
  }, [h.rev, meta, doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (h.rev !== savedRev.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [h.rev]);

  // ---------------------------------------------------------------- derived
  const pendingMsg = messages.find((m) => m.role === "ai" && m.status === "pending") as Extract<ChatMsg, { role: "ai" }> | undefined;
  const pending = pendingMsg?.result ?? null;
  const shownSlides = useMemo(() => {
    if (!pending) return slides;
    const by = Object.fromEntries(pending.slides.map((s) => [s.slide_id, s]));
    return slides.map((s) => by[s.slide_id] ?? s);
  }, [slides, pending]);
  const idx = Math.max(0, shownSlides.findIndex((s) => s.slide_id === cur));
  const slide = shownSlides[idx];
  const curAreas = areas[cur] ?? [];
  const allAreas = Object.values(areas).flat();
  const highlights = useMemo(() => new Set([...(pending?.changed[cur] ?? []), ...flash]), [pending, cur, flash]);
  const issueIds = useMemo(() => new Set((qc?.issues ?? []).filter((i) => i.slide_id === cur && i.severity === "block" && i.block_id).map((i) => i.block_id!.split("[")[0])), [qc, cur]);
  const selBlocks = slide ? slide.blocks.filter((b) => selected.includes(b.block_id)) : [];
  const one = selBlocks.length === 1 ? selBlocks[0] : null;
  const readOnly = !!pending;

  const autoScope: Scope = selected.length || allAreas.length ? "selection" : "slide";
  const scope = scopePick ?? autoScope;

  // ---------------------------------------------------------------- mutations
  const commit = useCallback((next: Slide[], title?: string) => dispatch({ t: "commit", doc: { slides: next, title: title ?? h.doc.title } }), [h.doc.title]);
  const editSlide = (fn: (s: Slide) => Slide) => commit(mapSlide(slides, cur, fn));
  const patchSlide = (slideId: string, patch: Partial<Slide>) =>
    dispatch({ t: "apply", fn: (d) => ({ ...d, slides: d.slides.map((x) => (x.slide_id === slideId ? { ...x, ...patch } : x)) }) });
  const editSelected = (fn: (b: Block) => Block) => editSlide((s) => mapBlocks(s, new Set(selected), fn));

  const selectSlide = (id: string) => {
    setCur(id);
    setSelected([]);
    setEditingId(null);
  };

  const addBlock = (b: Block, edit = false) => {
    editSlide((s) => ({ ...s, blocks: [...s.blocks, b], asset_ids: b.kind === "image" && !s.asset_ids.includes(b.asset_id) ? [...s.asset_ids, b.asset_id] : s.asset_ids }));
    setTool("select");
    setSelected([b.block_id]);
    if (edit) setTimeout(() => setEditingId(b.block_id), 30);
  };

  const deleteSelected = () => {
    if (!selected.length || readOnly) return;
    editSlide((s) => ({ ...s, blocks: s.blocks.filter((b) => !selected.includes(b.block_id)) }));
    setSelected([]);
  };

  const reorder = (to: "front" | "back") =>
    editSlide((s) => {
      const moving = s.blocks.filter((b) => selected.includes(b.block_id));
      const rest = s.blocks.filter((b) => !selected.includes(b.block_id));
      if (to === "front") return { ...s, blocks: [...rest, ...moving] };
      const bgAt = rest[0]?.block_id === "bg" ? 1 : 0;
      return { ...s, blocks: [...rest.slice(0, bgAt), ...moving, ...rest.slice(bgAt)] };
    });

  const setBackground = (color: string | null) =>
    editSlide((s) => {
      const bg = s.blocks.find((b) => b.block_id === "bg");
      if (!color) return { ...s, blocks: s.blocks.filter((b) => b.block_id !== "bg") };
      if (bg) return mapBlocks(s, new Set(["bg"]), (b) => ({ ...b, fill: color }) as Block);
      return { ...s, blocks: [{ kind: "shape", block_id: "bg", region: { x: 0, y: 0, w: 1280, h: 720 }, shape: "rect", fill: color, line: null, line_width: 0.75 }, ...s.blocks] };
    });

  const moveSlide = (from: number, to: number) => {
    if (from === to || readOnly) return;
    const next = [...slides];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    commit(next);
  };

  const finishEdit = (id: string, paras: EParagraph[] | null) => {
    setEditingId(null);
    if (!paras) return;
    const b = slide?.blocks.find((x) => x.block_id === id) as TextBlock | undefined;
    if (!b || JSON.stringify(b.paragraphs) === JSON.stringify(paras)) return;
    editSlide((s) => mapBlocks(s, new Set([id]), (x) => ({ ...(x as TextBlock), paragraphs: paras })));
  };

  // ---------------------------------------------------------------- AI
  const contextText = () => {
    const parts = [`슬라이드 ${idx + 1}`];
    if (selected.length) parts.push(`요소 ${selected.length}개`);
    if (allAreas.length) parts.push(`영역 ${allAreas.length}개`);
    return parts.join(" · ");
  };

  const sendAi = async (text: string) => {
    if (!slide) return;
    if (editingId) setEditingId(null);
    const effective: Scope = scopePick ?? (/(전체|모든)\s*(슬라이드|장표|페이지|PPT|덱)|통일/.test(text) && !selected.length && !allAreas.length ? "deck" : autoScope);
    const userMsg: ChatMsg = { id: `u${Date.now()}`, role: "user", text, scope: effective, context: contextText() };
    setMessages((m) => [...m, userMsg]);
    setAiBusy(true);
    setAiError(null);
    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const out = await api.post<AiOut>(`/decks/${deckId}/edit/ai`, {
        message: text,
        slides,
        current_slide_id: cur,
        scope: effective,
        selection: { element_ids: selected.length ? { [cur]: selected } : {}, areas: allAreas },
        history,
        mode,
      });
      const status = out.applied.length ? "pending" : "empty";
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "ai", text: out.reply || "바꿀 내용이 없습니다.", mode: out.mode, result: out, status, areaIds: allAreas.map((a) => a.id) }]);
      const firstChanged = Object.keys(out.changed)[0];
      if (firstChanged && firstChanged !== cur && !out.changed[cur]) setCur(firstChanged);
    } catch (e) {
      const err = e as ApiError;
      setAiError(`${err.message}${err.action ? ` — ${err.action}` : ""}`);
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "ai", text: `요청을 처리하지 못했습니다: ${err.message}`, mode, status: "error" }]);
    } finally {
      setAiBusy(false);
    }
  };

  const applyAi = async (id: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m || m.role !== "ai" || !m.result) return;
    const by = Object.fromEntries(m.result.slides.map((s) => [s.slide_id, s]));
    const before = slides;
    const merged = slides.map((s) => by[s.slide_id] ?? s);
    // The apply call saves this exact copy and logs it with the before/after snapshots,
    // so the autosave must not send it a second time.
    await saving.current;
    savedRev.current = h.rev + 1;
    commit(merged);
    const changed = new Set(Object.values(m.result.changed).flat());
    setFlash(changed);
    setTimeout(() => setFlash(new Set()), 2400);
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, status: "applied" } : x)) as ChatMsg[]);
    clearUsedAreas(m);
    try {
      const out = await api.post<{ edit_version: number; qc: QC }>(`/decks/${deckId}/edit/log/${m.result.log_id}/apply`, {
        base_version: version.current,
        slides_before: before,
        slides: merged,
        title: h.doc.title,
      });
      version.current = out.edit_version;
      setQc(out.qc);
      setSave("saved");
      setSaveError(null);
    } catch (e) {
      savedRev.current = -1; // fall back to a plain save of what is on screen
      setSave("dirty");
      setSaveError(`수정안 기록 실패: ${(e as ApiError).message}`);
    }
    void reloadLog();
  };
  const cancelAi = (id: string) => {
    const m = messages.find((x) => x.id === id);
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x)) as ChatMsg[]);
    if (m) clearUsedAreas(m);
    if (m?.role === "ai" && m.result?.log_id) void api.post(`/decks/${deckId}/edit/log/${m.result.log_id}/cancel`).then(reloadLog, () => undefined);
  };
  const restore = async (entry: EditLogEntry, to: "after" | "before") => {
    const when = to === "after" ? "적용 직후" : "적용 직전";
    if (!confirm(`'${entry.message.slice(0, 40)}' ${when}의 편집본으로 되돌릴까요?\n지금 상태도 기록에 남아 다시 돌아올 수 있습니다.`)) return;
    try {
      await saving.current;
      await doSave();
      const out = await api.post<EditOut & { log: EditLogEntry }>(`/decks/${deckId}/edit/log/${entry.id}/restore`, { base_version: version.current, to });
      savedRev.current = h.rev + 1;
      commit(out.slides); // also undoable locally
      version.current = out.edit_version;
      setQc(out.qc);
      setSave("saved");
      setSaveError(null);
      if (!out.slides.some((s) => s.slide_id === cur)) setCur(out.slides[0]?.slide_id ?? "");
      const target = entry.slide_ids.find((sid) => out.slides.some((s) => s.slide_id === sid));
      if (target) setCur(target);
      setSelected([]);
    } catch (e) {
      setSaveError(`되돌리기 실패: ${(e as ApiError).message}`);
    }
    void reloadLog();
  };
  // The marked areas were the target of that request: once it is applied or cancelled they are done.
  // Areas drawn after the request was sent stay.
  const clearUsedAreas = (m: ChatMsg) => {
    const used = new Set(m.role === "ai" ? m.areaIds ?? [] : []);
    if (!used.size) return;
    setAreas((all) => Object.fromEntries(Object.entries(all).map(([sid, list]) => [sid, list.filter((a) => !used.has(a.id))]).filter(([, list]) => list.length)));
    setScopePick(null);
    setTool("select");
  };

  // ---------------------------------------------------------------- export
  const exportPptx = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      await saving.current;
      await doSave();
      const out = await api.post<{ id: string; files: string[] }>(`/decks/${deckId}/edit/export`);
      const href = fileUrl(`/exports/${out.id}/files/report.pptx`);
      setExportMsg({ tone: "ok", text: "편집본을 PPTX로 내보냈습니다.", href });
      const a = document.createElement("a");
      a.href = href;
      a.click();
    } catch (e) {
      const err = e as ApiError;
      setExportMsg({ tone: "bad", text: `${err.message}${err.action ? ` — ${err.action}` : ""}` });
      if (err.code === "QC_BLOCKED") setQcOpen(true);
    } finally {
      setExporting(false);
    }
  };

  const resetAll = async () => {
    if (!confirm("편집한 내용을 모두 버리고 생성된 초안으로 되돌릴까요? 지금 편집본은 기록 탭에 남아 다시 돌아올 수 있습니다.")) return;
    const m = await api.del<EditOut>(`/decks/${deckId}/edit`);
    version.current = m.edit_version;
    savedRev.current = 0;
    dispatch({ t: "reset", doc: { slides: m.slides, title: m.title } });
    setQc(m.qc);
    setCur(m.slides[0]?.slide_id ?? "");
    setSelected([]);
    setAreas({});
    setSave("saved");
    void reloadLog();
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (present !== null || presenter !== null) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (!readOnly) dispatch({ t: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (mod && e.key.toLowerCase() === "y" && !isTyping(e.target)) {
        e.preventDefault();
        if (!readOnly) dispatch({ t: "redo" });
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") {
        setSelected([]);
        setTool("select");
      } else if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "r" || e.key === "R") setTool("area");
      else if (e.key.startsWith("Arrow") && selected.length && !readOnly) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        editSelected((b) => ({ ...b, region: clampRegion({ ...b.region, x: b.region.x + dx, y: b.region.y + dy }) }) as Block);
      } else if (!selected.length && (e.key === "PageDown" || e.key === "PageUp")) {
        const n = idx + (e.key === "PageDown" ? 1 : -1);
        if (shownSlides[n]) selectSlide(shownSlides[n].slide_id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- render
  if (loadError) {
    return (
      <div className="ed-root ed-center">
        <div className="ed-empty-box">
          <h2>편집기를 열 수 없습니다</h2>
          <p>{loadError.message}</p>
          {loadError.action && <p className="ed-hint">{loadError.action}</p>}
          <Link href="/" className="ed-btn">
            프로젝트 목록으로
          </Link>
        </div>
      </div>
    );
  }
  if (!meta || !tokens) {
    return (
      <div className="ed-root ed-center">
        <p className="ed-hint">편집기를 불러오는 중…</p>
      </div>
    );
  }

  const saveLabel = { saved: "저장됨", dirty: "편집 중", saving: "저장 중…", error: "저장 실패" }[save];
  const slideIssues = (qc?.issues ?? []).filter((i) => i.slide_id === cur);
  const bgFill = (slide?.blocks.find((b) => b.block_id === "bg") as { fill?: string } | undefined)?.fill ?? null;

  const addSlide = () => {
    const s = blankSlide();
    const next = [...slides];
    next.splice(idx + 1, 0, s);
    commit(next);
    selectSlide(s.slide_id);
  };
  const dupSlide = () => {
    const c = duplicateSlide(slides[idx]);
    const next = [...slides];
    next.splice(idx + 1, 0, c);
    commit(next);
    selectSlide(c.slide_id);
  };
  const delSlide = () => {
    if (!confirm(`${idx + 1}번 슬라이드를 삭제할까요? (실행 취소로 되돌릴 수 있습니다)`)) return;
    const next = slides.filter((s) => s.slide_id !== cur);
    commit(next);
    selectSlide(next[Math.min(idx, next.length - 1)].slide_id);
  };

  return (
    <div className="ed-root">
      <style>{FONT_CSS}</style>
      {/* ------------------------------------------------ toolbar */}
      <header className="ed-toolbar">
        <div className="ed-tb-left">
          <Link href={`/projects/${meta.project_id}/output`} className="ed-back" aria-label="팩트북 출력 화면으로" data-tip="출력 화면으로">
            <Icon name="back2" size={16} />
          </Link>
          <span className="ed-mark" aria-hidden>
            F
          </span>
          <div className="ed-docname">
            <input className="ed-filename" value={h.doc.title} aria-label="파일 이름" onChange={(e) => dispatch({ t: "commit", doc: { slides, title: e.target.value } })} />
            <span className="ed-project">
              {meta.project_name}
              <span className={`ed-save s-${save}`} title={saveError ?? undefined}>
                <i aria-hidden />
                {saveLabel}
              </span>
            </span>
          </div>
        </div>

        <div className="ed-tb-center">
          <div className="ed-group">
            <ToolBtn label="실행 취소 · ⌘Z" icon="undo" onClick={() => dispatch({ t: "undo" })} disabled={!h.past.length || readOnly} />
            <ToolBtn label="다시 실행 · ⇧⌘Z" icon="redo" onClick={() => dispatch({ t: "redo" })} disabled={!h.future.length || readOnly} />
          </div>
          <div className="ed-group">
            <ToolBtn label="선택 · V" icon="cursor" on={tool === "select"} onClick={() => setTool("select")} />
            <ToolBtn label="영역 지정 · R" icon="area" on={tool === "area"} accent onClick={() => setTool(tool === "area" ? "select" : "area")} />
          </div>
          <div className="ed-group">
            <ToolBtn label="텍스트 추가" icon="text" disabled={readOnly} onClick={() => slide && addBlock(textBox(slide, { x: 440, y: 300, w: 400, h: 60 }), true)} />
            <div className="ed-menu-wrap">
              <ToolBtn label="도형 추가" icon="shape" disabled={readOnly} on={shapeMenu} onClick={() => setShapeMenu((v) => !v)} />
              {shapeMenu && (
                <div className="ed-menu" onMouseLeave={() => setShapeMenu(false)}>
                  {(
                    [
                      ["rect", "사각형", "shape"],
                      ["rounded", "둥근 사각형", "rounded"],
                      ["line", "선", "line"],
                    ] as const
                  ).map(([k, l, ic]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setShapeMenu(false);
                        if (slide) addBlock(shapeBox(slide, { x: 520, y: 300, w: 240, h: 120 }, k));
                      }}
                    >
                      <Icon name={ic} size={16} />
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ToolBtn label="이미지 추가 · 수집한 자료 이미지" icon="image" disabled={readOnly || !assets.length} onClick={() => setPicker(true)} />
          </div>
          <div className="ed-group ed-zoomgroup">
            <ToolBtn label="축소" icon="minus" onClick={() => setZoom(Math.max(0.2, Math.round((scale - 0.1) * 10) / 10))} />
            <button type="button" className="ed-zoom" onClick={() => setZoom("fit")} data-tip="화면에 맞춤">
              {Math.round(scale * 100)}%
            </button>
            <ToolBtn label="확대" icon="plus" onClick={() => setZoom(Math.min(2, Math.round((scale + 0.1) * 10) / 10))} />
          </div>
        </div>

        <div className="ed-tb-right">
          <button type="button" className={`ed-qc ${qc?.blocks ? "bad" : "ok"}`} onClick={() => setQcOpen((v) => !v)} aria-expanded={qcOpen}>
            <Icon name={qc?.blocks ? "alert" : "shield"} size={15} />
            {qc?.blocks ? `차단 ${qc.blocks}` : "검수 통과"}
            <span className="ed-qc-warn">경고 {qc?.warns ?? 0}</span>
          </button>
          <div className="ed-menu-wrap ed-split">
            <button type="button" className="ed-btn ghost" onClick={() => setPresent(idx)} title="현재 슬라이드부터 전체 화면 발표">
              <Icon name="play" size={15} />
              발표
            </button>
            <button type="button" className="ed-btn ghost ed-split-arrow" aria-label="발표 방식 선택" aria-expanded={presentMenu} onClick={() => setPresentMenu((v) => !v)}>
              <Icon name="back2" size={13} style={{ transform: "rotate(-90deg)" }} />
            </button>
            {presentMenu && (
              <div className="ed-menu right" onMouseLeave={() => setPresentMenu(false)}>
                <button type="button" onClick={() => (setPresentMenu(false), setPresent(idx))}>
                  <Icon name="play" size={16} />
                  현재 슬라이드부터
                </button>
                <button type="button" onClick={() => (setPresentMenu(false), setPresent(0))}>
                  <Icon name="reset" size={16} />
                  처음부터
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setPresentMenu(false);
                    await saving.current;
                    await doSave();
                    setPresenter(idx);
                  }}
                >
                  <Icon name="layers" size={16} />
                  <span>
                    발표자 보기
                    <em>대본 화면 + 청중 화면 두 개</em>
                  </span>
                </button>
              </div>
            )}
          </div>
          <button type="button" className="ed-btn primary" onClick={exportPptx} disabled={exporting || readOnly || save === "error"}>
            <Icon name="download" size={15} />
            {exporting ? "내보내는 중…" : "PPTX 내보내기"}
          </button>
        </div>
      </header>

      {/* ------------------------------------------------ property bar */}
      <div className={`ed-props ${readOnly ? "preview" : ""}`}>
        {readOnly ? (
          <span className="ed-preview-banner">
            <Icon name="sparkle" size={15} />
            AI 수정안 미리보기 중 — 바뀐 요소가 초록색으로 표시됩니다. 오른쪽에서 적용하거나 취소하세요.
          </span>
        ) : one ? (
          <PropBar block={one} tokens={tokens} onChange={(fn) => editSelected(fn)} onOrder={reorder} onDelete={deleteSelected} />
        ) : selBlocks.length > 1 ? (
          <div className="ed-prow">
            <span className="ed-pill">요소 {selBlocks.length}개</span>
            <span className="ed-vsep" />
            <IconBtn label="맨 앞으로" icon="front" onClick={() => reorder("front")} />
            <IconBtn label="맨 뒤로" icon="back" onClick={() => reorder("back")} />
            <IconBtn label="삭제" icon="trash" danger onClick={deleteSelected} />
          </div>
        ) : (
          <div className="ed-prow">
            <span className="ed-pill">슬라이드 {idx + 1}</span>
            <label className="ed-namefield">
              <span>이름</span>
              <SlideName value={slide?.title ?? ""} onCommit={(v) => slide && patchSlide(slide.slide_id, { title: v })} />
            </label>
            <span className="ed-vsep" />
            <span className="ed-plabel">배경</span>
            <ColorPick tokens={tokens} value={bgFill} onPick={(c) => setBackground(c)} allowNone label="슬라이드 배경색" />
            <span className="ed-vsep" />
            <span className="ed-hint">클릭 선택 · 더블클릭 글자 편집 · 드래그 이동 · R 영역 지정</span>
            <span className="spacer" />
            {meta.edited && (
              <button type="button" className="ed-btn sm ghost" onClick={resetAll}>
                <Icon name="reset" size={14} />
                초안으로 되돌리기
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ed-body">
        {/* ------------------------------------------------ slide list */}
        <nav className="ed-slides" aria-label="슬라이드 목록">
          <div className="ed-slides-head">
            <span className="ed-plabel">슬라이드 {shownSlides.length}</span>
            <span className="spacer" />
            <IconBtn label="새 슬라이드" icon="plus" disabled={readOnly} onClick={addSlide} />
            <IconBtn label="현재 슬라이드 복제" icon="copy" disabled={readOnly || !slide} onClick={dupSlide} />
            <IconBtn label="현재 슬라이드 삭제" icon="trash" danger disabled={readOnly || slides.length <= 1} onClick={delSlide} />
          </div>
          <ol className="ed-thumbs">
            {shownSlides.map((s, i) => (
              <li
                key={s.slide_id}
                className={`${s.slide_id === cur ? "on" : ""} ${pending?.changed[s.slide_id] ? "changed" : ""}`}
                draggable={!readOnly}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  moveSlide(Number(e.dataTransfer.getData("text/plain")), i);
                }}
              >
                <button type="button" onClick={() => selectSlide(s.slide_id)} aria-current={s.slide_id === cur ? "true" : undefined} aria-label={`${i + 1}번 슬라이드: ${slideLabel(s)}`}>
                  <span className="ed-thumb-no">{i + 1}</span>
                  <span className="ed-thumb">
                    <SlideView slide={s} tokens={tokens} assets={assetMap} scale={0.128} />
                    {(areas[s.slide_id]?.length ?? 0) > 0 && <span className="ed-thumb-area">영역 {areas[s.slide_id].length}</span>}
                    {s.speaker_notes?.trim() && (
                      <span className="ed-thumb-note" title="발표자 메모 있음">
                        메모
                      </span>
                    )}
                  </span>
                </button>
                {renaming === s.slide_id ? (
                  <SlideName
                    autoFocus
                    className="ed-thumb-input"
                    value={s.title}
                    onCommit={(v) => {
                      setRenaming(null);
                      patchSlide(s.slide_id, { title: v });
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <span className="ed-thumb-title" title={`${s.title} — 더블클릭해 이름 바꾸기`} onDoubleClick={() => !readOnly && setRenaming(s.slide_id)}>
                    {s.title}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* ------------------------------------------------ canvas */}
        <div className="ed-center-col">
        <section className="ed-stage" ref={setStageEl} aria-label="슬라이드 편집 캔버스">
          <div className="ed-toasts">
            {meta.stale && <div className="ed-toast warn">초안 생성 뒤 자료가 바뀌었습니다. 편집은 계속할 수 있고, 내보내기 전에 초안을 다시 만들어야 합니다.</div>}
            {saveError && <div className="ed-toast bad">{saveError}</div>}
            {exportMsg && (
              <div className={`ed-toast ${exportMsg.tone === "bad" ? "bad" : "ok"}`}>
                <Icon name={exportMsg.tone === "bad" ? "alert" : "check"} size={15} />
                <span>{exportMsg.text}</span>
                {exportMsg.href && (
                  <a href={exportMsg.href} download>
                    다시 받기
                  </a>
                )}
                <button type="button" className="ed-x" onClick={() => setExportMsg(null)} aria-label="닫기">
                  <Icon name="x" size={14} />
                </button>
              </div>
            )}
          </div>
          {slide ? (
            <Canvas
              slide={slide}
              tokens={tokens}
              assets={assetMap}
              scale={scale}
              tool={tool}
              selected={selected}
              areas={curAreas}
              editingId={editingId}
              highlights={highlights}
              issueIds={issueIds}
              readOnly={readOnly}
              onSelect={setSelected}
              onRegions={(r: Record<string, Region>) => editSlide((s) => setRegions(s, r))}
              onAreas={(a) => setAreas((all) => ({ ...all, [cur]: a }))}
              onEdit={(id) => {
                setSelected(id ? [id] : []);
                setEditingId(id);
              }}
              onFinishEdit={finishEdit}
            />
          ) : (
            <p className="ed-hint">슬라이드가 없습니다. 새 슬라이드를 추가하세요.</p>
          )}
          <div className="ed-stage-foot">
            {idx + 1} / {shownSlides.length} · {slide ? slideLabel(slide) : ""}
          </div>
          {qcOpen && (
            <div className="ed-pop ed-qc-pop" role="dialog" aria-label="검수 목록">
              <div className="ed-pop-head">
                <strong>출력 전 검수</strong>
                <span className="spacer" />
                <button type="button" className="ed-x" onClick={() => setQcOpen(false)} aria-label="닫기">
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div className="ed-pop-sub">이 슬라이드</div>
              {slideIssues.length === 0 ? (
                <p className="ed-hint ed-pop-empty">검수 항목이 없습니다.</p>
              ) : (
                <ul>
                  {slideIssues.map((i, k) => (
                    <li key={k} className={i.severity}>
                      <button type="button" onClick={() => i.block_id && setSelected([i.block_id.split("[")[0]])}>
                        <span className="ed-sev">{i.severity === "block" ? "차단" : "경고"}</span>
                        <span>
                          {i.message}
                          <em>{i.action}</em>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {qc && qc.issues.some((i) => i.severity === "block" && i.slide_id !== cur) && (
                <>
                  <div className="ed-pop-sub">다른 슬라이드의 차단</div>
                  <ul>
                    {qc.issues
                      .filter((i) => i.severity === "block" && i.slide_id !== cur)
                      .slice(0, 12)
                      .map((i, k) => (
                        <li key={k} className="block">
                          <button type="button" onClick={() => i.slide_id && selectSlide(i.slide_id)}>
                            <span className="ed-sev">{i.slide_id ? `${shownSlides.findIndex((s) => s.slide_id === i.slide_id) + 1}번` : "덱"}</span>
                            <span>{i.message}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
        {slide && (
          <NotesPanel
            key={slide.slide_id}
            value={slide.speaker_notes ?? ""}
            trace={slide.notes}
            readOnly={readOnly}
            onCommit={(v) => patchSlide(slide.slide_id, { speaker_notes: v })}
          />
        )}
        </div>

        {/* ------------------------------------------------ AI */}
        <AiPanel
          slideNo={idx + 1}
          slideTitle={slide ? slideLabel(slide) : ""}
          selectedCount={selected.length}
          areas={allAreas}
          areaSlides={Object.values(areas).filter((a) => a.length).length}
          scope={scope}
          autoScope={scopePick === null}
          onScope={setScopePick}
          modes={meta.ai.modes}
          mode={mode}
          onMode={setMode}
          messages={messages}
          busy={aiBusy}
          error={aiError}
          onSend={sendAi}
          onApply={applyAi}
          onCancel={cancelAi}
          areaMode={tool === "area"}
          onAreaMode={() => setTool(tool === "area" ? "select" : "area")}
          onClearSelection={() => {
            setSelected([]);
            setAreas({});
            setScopePick(null);
          }}
          onFocusTarget={(sid, eid) => {
            setCur(sid);
            setSelected(eid ? [eid] : []);
          }}
          log={log}
          slideNoOf={(sid) => shownSlides.findIndex((s) => s.slide_id === sid) + 1}
          onRestore={restore}
          busyLog={readOnly}
        />
      </div>

      {picker && (
        <div className="ed-modal" role="dialog" aria-label="이미지 추가" onClick={() => setPicker(false)}>
          <div className="ed-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ed-pop-head">
              <div>
                <strong>이미지 추가</strong>
                <p className="ed-hint" style={{ margin: "2px 0 0" }}>
                  출처가 연결된 자료 카드의 이미지만 넣을 수 있습니다.
                </p>
              </div>
              <span className="spacer" />
              <button type="button" className="ed-x" onClick={() => setPicker(false)} aria-label="닫기">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="ed-asset-grid">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setPicker(false);
                    if (!slide) return;
                    const w = 320;
                    const hh = Math.min(400, (w * a.height) / a.width);
                    addBlock({ kind: "image", block_id: newBlockId(slide, "image_"), region: clampRegion({ x: 480, y: 160, w, h: hh }), asset_id: a.id, crop: { x: 0, y: 0, w: 1, h: 1 } });
                  }}
                >
                  <img src={`${API_URL}/assets/${a.id}/file`} alt="" />
                  <span>{a.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {presenter !== null && <PresenterView deckId={deckId} slides={shownSlides} start={presenter} tokens={tokens} assets={assetMap} onClose={() => setPresenter(null)} />}
      {present !== null && <Present slides={shownSlides} start={present} tokens={tokens} assets={assetMap} onClose={() => setPresent(null)} />}
    </div>
  );
}

/** Text field that commits on Enter/blur (one history step per rename, not per keystroke). */
function SlideName({ value, onCommit, onCancel, autoFocus, className = "" }: { value: string; onCommit: (v: string) => void; onCancel?: () => void; autoFocus?: boolean; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const done = () => {
    const t = v.trim();
    if (t && t !== value) onCommit(t);
    else {
      setV(value);
      onCancel?.();
    }
  };
  return (
    <input
      className={`ed-name-input ${className}`}
      value={v}
      autoFocus={autoFocus}
      aria-label="슬라이드 이름"
      maxLength={120}
      onChange={(e) => setV(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          onCancel?.();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Speaker notes under the canvas, like PowerPoint. Commits after a pause or on blur. */
function NotesPanel({ value, trace, readOnly, onCommit }: { value: string; trace: string; readOnly: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("ptk-editor-notes") !== "closed";
    } catch {
      return true;
    }
  });
  const [showTrace, setShowTrace] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    setV(value);
    last.current = value;
  }, [value]);
  useEffect(() => {
    if (v === last.current) return;
    const t = setTimeout(() => {
      last.current = v;
      onCommit(v);
    }, 700);
    return () => clearTimeout(t);
  }, [v, onCommit]);
  const latest = useRef({ v, onCommit });
  latest.current = { v, onCommit };
  useEffect(
    () => () => {
      // Switching slides unmounts this panel: keep what was typed in the last pause window.
      if (latest.current.v !== last.current) latest.current.onCommit(latest.current.v);
    },
    [],
  );
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem("ptk-editor-notes", o ? "closed" : "open");
      } catch {
        /* storage blocked */
      }
      return !o;
    });
  };
  return (
    <section className={`ed-notes ${open ? "open" : ""}`} aria-label="발표자 메모">
      <header className="ed-notes-head">
        <button type="button" className="ed-notes-toggle" onClick={toggle} aria-expanded={open}>
          <Icon name="back2" size={13} style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)" }} />
          발표자 메모
          {value.trim() && !open && <span className="ed-notes-dot" aria-label="메모 있음" />}
        </button>
        <span className="ed-hint">{open ? "발표자 보기에서 대본으로 보이고, PPTX 슬라이드 노트로 내보냅니다" : ""}</span>
        <span className="spacer" />
        {open && trace && (
          <button type="button" className={`ed-btn xs ghost ${showTrace ? "on" : ""}`} onClick={() => setShowTrace((x) => !x)}>
            근거 기록
          </button>
        )}
      </header>
      {open && (
        <div className="ed-notes-body">
          <textarea
            value={v}
            placeholder="이 슬라이드에서 말할 내용을 적으세요. AI에게 '발표 대본 써줘'라고 요청할 수도 있습니다."
            disabled={readOnly}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
              if (v !== last.current) {
                last.current = v;
                onCommit(v);
              }
            }}
            aria-label="발표자 메모"
          />
          {showTrace && <pre className="ed-trace" aria-label="근거 기록 (자동 생성, 읽기 전용)">{trace}</pre>}
        </div>
      )}
    </section>
  );
}

function ToolBtn({ label, icon, on, accent, disabled, onClick }: { label: string; icon: IconName; on?: boolean; accent?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ed-tool ${on ? "on" : ""} ${accent ? "accent" : ""}`} aria-label={label} aria-pressed={on} data-tip={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

function IconBtn({ label, icon, danger, disabled, on, onClick }: { label: string; icon: IconName; danger?: boolean; disabled?: boolean; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ed-ibtn ${danger ? "danger" : ""} ${on ? "on" : ""}`} aria-label={label} aria-pressed={on} title={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/** A compact color control: current color chip that opens a palette popover. */
function ColorPick({ tokens, value, onPick, allowNone, label }: { tokens: Tokens; value: string | null; onPick: (c: string | null) => void; allowNone?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const wrap = useRef<HTMLSpanElement>(null);
  const toggle = () => {
    // The property bar scrolls horizontally (it clips absolute children), so the palette is fixed-positioned.
    const r = wrap.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 200), top: r.bottom + 6 });
    setOpen((v) => !v);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close, true); // capture: the canvas stops propagation
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);
  return (
    <span className="ed-color" ref={wrap}>
      <button type="button" className="ed-color-btn" aria-label={label} aria-expanded={open} onClick={toggle}>
        <span className={`ed-chip-sw ${value === null ? "none" : ""}`} style={value ? { background: colorOf(tokens, value) } : undefined} />
        <span className="ed-color-name">{value === null ? "없음" : value.startsWith("#") ? value : value}</span>
      </button>
      {open && (
        <div className="ed-pop ed-palette" role="dialog" aria-label={label} style={pos}>
          <div className="ed-palette-grid">
            {allowNone && (
              <button type="button" className={`ed-sw none ${value === null ? "on" : ""}`} aria-label="없음" onClick={() => (onPick(null), setOpen(false))} />
            )}
            {COLOR_CHOICES.map((c) => (
              <button key={c} type="button" className={`ed-sw ${value === c ? "on" : ""}`} aria-label={c} data-tip={c} style={{ background: colorOf(tokens, c) }} onClick={() => (onPick(c), setOpen(false))} />
            ))}
          </div>
          <label className="ed-custom">
            <input type="color" value={value && value.startsWith("#") ? value : colorOf(tokens, value ?? "white")} onChange={(e) => onPick(e.target.value.toUpperCase())} />
            직접 고르기
          </label>
        </div>
      )}
    </span>
  );
}

function Num({ label, value, onChange, step = 1, unit }: { label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(Math.round(value * 10) / 10)), [value]);
  return (
    <label className="ed-num">
      <span className="ed-num-k">{label}</span>
      <input
        type="number"
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (Number.isFinite(n) && n !== value) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {unit && <span className="ed-num-u">{unit}</span>}
    </label>
  );
}

const KIND_LABEL: Record<Block["kind"], string> = { text: "텍스트", shape: "도형", image: "이미지", table: "표", bar_chart: "막대 차트", line_chart: "선 차트" };

function PropBar({ block, tokens, onChange, onOrder, onDelete }: { block: Block; tokens: Tokens; onChange: (fn: (b: Block) => Block) => void; onOrder: (to: "front" | "back") => void; onDelete: () => void }) {
  const r = block.region;
  const setR = (k: keyof Region, v: number) => onChange((b) => ({ ...b, region: clampRegion({ ...b.region, [k]: v }) }) as Block);
  return (
    <div className="ed-prow">
      <span className="ed-pill" title={block.block_id}>
        {KIND_LABEL[block.kind]}
      </span>
      <span className="ed-vsep" />
      <div className="ed-numgroup">
        <Num label="X" value={r.x} onChange={(v) => setR("x", v)} />
        <Num label="Y" value={r.y} onChange={(v) => setR("y", v)} />
        <Num label="W" value={r.w} onChange={(v) => setR("w", v)} />
        <Num label="H" value={r.h} onChange={(v) => setR("h", v)} />
      </div>
      {block.kind === "text" && (
        <>
          <span className="ed-vsep" />
          <Num label="크기" unit="pt" step={0.5} value={block.size} onChange={(v) => onChange((b) => scaleText(b as TextBlock, Math.min(96, Math.max(tokens.min_font_pt ?? 6.5, v))))} />
          <select className="ed-select" aria-label="굵기" value={block.weight ?? (block.bold ? "bold" : "regular")} onChange={(e) => onChange((b) => setWeight(b as TextBlock, e.target.value as Weight))}>
            {WEIGHTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <div className="ed-seg sm" role="group" aria-label="정렬">
            {(["l", "c", "r"] as const).map((a) => (
              <button key={a} type="button" className={block.align === a ? "on" : ""} onClick={() => onChange((b) => ({ ...(b as TextBlock), align: a }))} aria-label={{ l: "왼쪽 정렬", c: "가운데 정렬", r: "오른쪽 정렬" }[a]} title={{ l: "왼쪽", c: "가운데", r: "오른쪽" }[a]}>
                <Icon name={{ l: "alignL", c: "alignC", r: "alignR" }[a] as IconName} size={15} />
              </button>
            ))}
          </div>
          <span className="ed-vsep" />
          <span className="ed-plabel">글자</span>
          <ColorPick tokens={tokens} value={block.color} onPick={(c) => c && onChange((b) => setTextColor(b as TextBlock, c))} label="글자색" />
          <span className="ed-plabel">채우기</span>
          <ColorPick tokens={tokens} value={block.fill ?? null} onPick={(c) => onChange((b) => ({ ...(b as TextBlock), fill: c }))} allowNone label="채우기" />
        </>
      )}
      {block.kind === "shape" && (
        <>
          <span className="ed-vsep" />
          {block.shape !== "line" && (
            <>
              <span className="ed-plabel">채우기</span>
              <ColorPick tokens={tokens} value={block.fill ?? null} onPick={(c) => onChange((b) => ({ ...b, fill: c }) as Block)} allowNone label="채우기" />
            </>
          )}
          <span className="ed-plabel">선</span>
          <ColorPick tokens={tokens} value={block.line ?? null} onPick={(c) => onChange((b) => ({ ...b, line: c }) as Block)} allowNone label="선 색" />
        </>
      )}
      {block.kind === "table" && (
        <>
          <span className="ed-vsep" />
          <Num label="크기" unit="pt" step={0.5} value={block.size} onChange={(v) => onChange((b) => ({ ...(b as typeof block), size: v, header_size: Math.round((block.header_size * v * 10) / block.size) / 10 }))} />
        </>
      )}
      <span className="spacer" />
      <IconBtn label="맨 앞으로" icon="front" onClick={() => onOrder("front")} />
      <IconBtn label="맨 뒤로" icon="back" onClick={() => onOrder("back")} />
      <IconBtn label="삭제 · Delete" icon="trash" danger onClick={onDelete} />
    </div>
  );
}

function Present({ slides, start, tokens, assets, onClose }: { slides: Slide[]; start: number; tokens: Tokens; assets: Record<string, AssetChoice>; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(e.key)) setI((n) => Math.min(slides.length - 1, n + 1));
      if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen?.();
    };
  }, [slides.length, onClose]);
  const scale = Math.min(size.w / tokens.canvas.w, size.h / tokens.canvas.h);
  const s = slides[i];
  return (
    <div className="ed-present" onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))}>
      {s && <SlideView slide={s} tokens={tokens} assets={assets} scale={scale} />}
      <div className="ed-present-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setI((n) => Math.max(0, n - 1))} aria-label="이전">
          <Icon name="back2" size={16} />
        </button>
        <span>
          {i + 1} / {slides.length}
        </span>
        <button type="button" onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))} aria-label="다음">
          <Icon name="back2" size={16} style={{ transform: "scaleX(-1)" }} />
        </button>
        <span className="ed-vsep" />
        <button type="button" onClick={onClose}>
          닫기 · Esc
        </button>
      </div>
    </div>
  );
}
