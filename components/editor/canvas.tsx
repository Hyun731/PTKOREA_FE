"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clampRegion, parseEdited } from "./ops";
import { BlockView, slideBackground } from "./slide-view";
import type { Area, AssetChoice, Block, EParagraph, Region, Slide, TextBlock, Tokens } from "./types";

export type Tool = "select" | "area";
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Drag =
  | { kind: "move"; ids: string[]; sx: number; sy: number; orig: Record<string, Region>; moved: boolean }
  | { kind: "resize"; id: string; handle: Handle; sx: number; sy: number; orig: Region }
  | { kind: "area-new"; sx: number; sy: number; x: number; y: number }
  | { kind: "area-move"; id: string; sx: number; sy: number; orig: Area }
  | { kind: "area-resize"; id: string; sx: number; sy: number; orig: Area };

function resized(o: Region, h: Handle, dx: number, dy: number): Region {
  let { x, y, w, h: hh } = o;
  if (h.includes("w")) {
    x = Math.min(o.x + dx, o.x + o.w - 4);
    w = o.w - (x - o.x);
  }
  if (h.includes("e")) w = Math.max(4, o.w + dx);
  if (h.includes("n")) {
    y = Math.min(o.y + dy, o.y + o.h - 1);
    hh = o.h - (y - o.y);
  }
  if (h.includes("s")) hh = Math.max(1, o.h + dy);
  return { x, y, w, h: hh };
}

export function Canvas({
  slide,
  tokens,
  assets,
  scale,
  tool,
  selected,
  areas,
  editingId,
  highlights,
  issueIds,
  readOnly,
  onSelect,
  onRegions,
  onAreas,
  onEdit,
  onFinishEdit,
}: {
  slide: Slide;
  tokens: Tokens;
  assets: Record<string, AssetChoice>;
  scale: number;
  tool: Tool;
  selected: string[];
  areas: Area[];
  editingId: string | null;
  highlights: Set<string>;
  issueIds: Set<string>;
  readOnly: boolean;
  onSelect: (ids: string[]) => void;
  onRegions: (regions: Record<string, Region>) => void;
  onAreas: (areas: Area[]) => void;
  onEdit: (id: string | null) => void;
  onFinishEdit: (id: string, paragraphs: EParagraph[] | null) => void;
}) {
  const { w: CW, h: CH } = tokens.canvas;
  const host = useRef<HTMLDivElement>(null);
  // Pointer events can outrun React renders, so the drag state lives in refs (state only for drawing).
  const dragRef = useRef<Drag | null>(null);
  const liveRef = useRef<Record<string, Region>>({});
  const areaRef = useRef<Area | null>(null);
  const [live, setLiveState] = useState<Record<string, Region>>({});
  const [liveArea, setLiveAreaState] = useState<Area | null>(null);
  const setDrag = (d: Drag | null) => (dragRef.current = d);
  const setLive = (v: Record<string, Region>) => {
    liveRef.current = v;
    setLiveState(v);
  };
  const setLiveArea = (v: Area | null) => {
    areaRef.current = v;
    setLiveAreaState(v);
  };
  const editRef = useRef<HTMLDivElement | null>(null);
  const finishing = useRef(false);

  const pt = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  useEffect(() => {
    setLive({});
    setLiveArea(null);
    setDrag(null);
  }, [slide.slide_id]);

  // Focus the text being edited and put the caret at the end.
  useLayoutEffect(() => {
    if (!editingId || !editRef.current) return;
    finishing.current = false;
    const el = editRef.current;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [editingId]);

  const finishEdit = (commit: boolean) => {
    if (!editingId || finishing.current) return;
    finishing.current = true;
    const b = slide.blocks.find((x) => x.block_id === editingId) as TextBlock | undefined;
    onFinishEdit(editingId, commit && b && editRef.current ? parseEdited(editRef.current, b) : null);
  };

  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = pt(e);
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    if (drag.kind === "move") {
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      drag.moved = true;
      const next: Record<string, Region> = {};
      for (const id of drag.ids) {
        const o = drag.orig[id];
        next[id] = clampRegion({ ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
      }
      setLive(next);
    } else if (drag.kind === "resize") {
      setLive({ [drag.id]: clampRegion(resized(drag.orig, drag.handle, Math.round(dx), Math.round(dy))) });
    } else if (drag.kind === "area-new") {
      const x0 = Math.min(drag.x, p.x);
      const y0 = Math.min(drag.y, p.y);
      setLiveArea({ id: "new", slide_id: slide.slide_id, x: Math.max(0, x0) / CW, y: Math.max(0, y0) / CH, w: Math.abs(p.x - drag.x) / CW, h: Math.abs(p.y - drag.y) / CH });
    } else if (drag.kind === "area-move") {
      const o = drag.orig;
      setLiveArea({ ...o, x: Math.min(Math.max(0, o.x + dx / CW), 1 - o.w), y: Math.min(Math.max(0, o.y + dy / CH), 1 - o.h) });
    } else if (drag.kind === "area-resize") {
      const o = drag.orig;
      setLiveArea({ ...o, w: Math.min(Math.max(0.01, o.w + dx / CW), 1 - o.x), h: Math.min(Math.max(0.01, o.h + dy / CH), 1 - o.y) });
    }
  };

  const onUp = () => {
    const drag = dragRef.current;
    const live = liveRef.current;
    const liveArea = areaRef.current;
    if (!drag) return;
    if ((drag.kind === "move" && drag.moved) || drag.kind === "resize") {
      if (Object.keys(live).length) onRegions(live);
    } else if (drag.kind === "area-new" && liveArea) {
      if (liveArea.w * CW > 8 && liveArea.h * CH > 8) onAreas([...areas, { ...liveArea, id: `A${Date.now().toString(36)}` }]);
    } else if ((drag.kind === "area-move" || drag.kind === "area-resize") && liveArea) {
      onAreas(areas.map((a) => (a.id === liveArea.id ? liveArea : a)));
    }
    setDrag(null);
    setLive({});
    setLiveArea(null);
  };

  const startMove = (e: React.PointerEvent, b: Block) => {
    if (readOnly || tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    if (editingId) finishEdit(true);
    let ids = selected;
    if (e.shiftKey || e.metaKey) {
      ids = selected.includes(b.block_id) ? selected.filter((x) => x !== b.block_id) : [...selected, b.block_id];
      onSelect(ids);
    } else if (!selected.includes(b.block_id)) {
      ids = [b.block_id];
      onSelect(ids);
    }
    const p = pt(e);
    const orig: Record<string, Region> = {};
    for (const x of slide.blocks) if (ids.includes(x.block_id)) orig[x.block_id] = x.region;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "move", ids, sx: p.x, sy: p.y, orig, moved: false });
  };

  const startResize = (e: React.PointerEvent, b: Block, handle: Handle) => {
    if (readOnly) return;
    e.stopPropagation();
    const p = pt(e);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "resize", id: b.block_id, handle, sx: p.x, sy: p.y, orig: b.region });
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (editingId) finishEdit(true);
    if (tool === "area") {
      const p = pt(e);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setDrag({ kind: "area-new", sx: p.x, sy: p.y, x: p.x, y: p.y });
      return;
    }
    onSelect([]);
  };

  const region = (b: Block) => live[b.block_id] ?? b.region;
  const shown = slide.blocks.map((b) => (live[b.block_id] ? ({ ...b, region: live[b.block_id] } as Block) : b));
  const areaList = liveArea ? (liveArea.id === "new" ? [...areas, liveArea] : areas.map((a) => (a.id === liveArea.id ? liveArea : a))) : areas;
  const single = selected.length === 1 ? shown.find((b) => b.block_id === selected[0]) : undefined;

  return (
    <div className="ed-stage-inner" style={{ width: CW * scale, height: CH * scale }}>
      <div
        ref={host}
        className={`ed-slide ed-slide-main ${tool === "area" ? "tool-area" : ""}`}
        style={{ width: CW, height: CH, transform: `scale(${scale})`, background: slideBackground(slide, tokens) }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* content */}
        {shown.map((b) => (
          <BlockView
            key={b.block_id}
            b={b}
            tokens={tokens}
            assets={assets}
            editing={editingId === b.block_id}
            textRef={editingId === b.block_id ? (el) => (editRef.current = el) : undefined}
            onTextBlur={editingId === b.block_id ? () => finishEdit(true) : undefined}
            onTextKey={
              editingId === b.block_id
                ? (e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      finishEdit(true);
                    }
                    e.stopPropagation();
                  }
                : undefined
            }
          />
        ))}
        {/* hit layer */}
        <div className="ed-hit-layer" onPointerDown={onBackgroundDown} style={{ pointerEvents: tool === "area" ? "auto" : undefined }}>
          {tool === "select" &&
            shown.map((b) => {
              if (b.block_id === "bg" || b.block_id === editingId) return null;
              const r = region(b);
              const hitH = Math.max(r.h, 6);
              return (
                <div
                  key={b.block_id}
                  className={`ed-hit ${selected.includes(b.block_id) ? "sel" : ""} ${highlights.has(b.block_id) ? "changed" : ""} ${issueIds.has(b.block_id) ? "issue" : ""}`}
                  style={{ left: r.x, top: r.y - (hitH - r.h) / 2, width: Math.max(r.w, 6), height: hitH }}
                  onPointerDown={(e) => startMove(e, b)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly && b.kind === "text") onEdit(b.block_id);
                  }}
                  title={b.kind === "text" ? "더블클릭해 텍스트 편집" : undefined}
                />
              );
            })}
          {tool === "area" &&
            shown.map((b) =>
              highlights.has(b.block_id) ? <div key={b.block_id} className="ed-hit changed" style={{ left: b.region.x, top: b.region.y, width: b.region.w, height: b.region.h, pointerEvents: "none" }} /> : null,
            )}
        </div>
        {/* selection frame + handles */}
        {tool === "select" &&
          shown
            .filter((b) => selected.includes(b.block_id) && b.block_id !== editingId)
            .map((b) => (
              <div key={b.block_id} className="ed-frame" style={{ left: b.region.x, top: b.region.y, width: b.region.w, height: Math.max(b.region.h, 1) }}>
                {single?.block_id === b.block_id &&
                  !readOnly &&
                  HANDLES.map((h) => <div key={h} className={`ed-handle h-${h}`} style={{ transform: `scale(${1 / scale})` }} onPointerDown={(e) => startResize(e, b, h)} />)}
              </div>
            ))}
        {/* marked areas */}
        {areaList.map((a, i) => (
          <div
            key={a.id}
            className={`ed-area ${tool === "area" ? "active" : ""}`}
            style={{ left: a.x * CW, top: a.y * CH, width: a.w * CW, height: a.h * CH }}
            onPointerDown={(e) => {
              if (tool !== "area" || a.id === "new") return;
              e.stopPropagation();
              const p = pt(e);
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              setDrag({ kind: "area-move", id: a.id, sx: p.x, sy: p.y, orig: a });
            }}
          >
            <span className="ed-area-tag" style={{ transform: `scale(${1 / scale})` }}>
              영역 {i + 1}
              {a.id !== "new" && (
                <button
                  type="button"
                  aria-label={`영역 ${i + 1} 삭제`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAreas(areas.filter((x) => x.id !== a.id));
                  }}
                >
                  ×
                </button>
              )}
            </span>
            {tool === "area" && a.id !== "new" && (
              <div
                className="ed-area-grip"
                style={{ transform: `scale(${1 / scale})` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const p = pt(e);
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  setDrag({ kind: "area-resize", id: a.id, sx: p.x, sy: p.y, orig: a });
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
