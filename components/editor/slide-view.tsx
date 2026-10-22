"use client";

// HTML rendering of a SlideSpec that follows core/rendering/pptx_renderer.py (same tokens,
// Pretendard weights, zero text margins), so what the editor shows matches the exported PPTX.

import type { CSSProperties, ReactNode } from "react";
import { API_URL } from "@/lib/api";
import type { AssetChoice, Block, EParagraph, EPart, ImageBlock, Slide, TableBlock, TextBlock, Tokens, Weight } from "./types";

export const PT = 4 / 3; // 1pt in canvas units (1 unit = 1px at 96dpi)
const WEIGHT: Record<Weight, number> = { light: 300, regular: 400, semibold: 600, bold: 700, heavy: 800 };
const ON_DARK = new Set(["white", "summary_text", "slate", "mist", "gold"]);
const BAR_ROLE: Record<string, string> = { self: "navy", key: "red", other: "bar_other", other2: "line_other2" };
const LINE_ROLE: Record<string, string> = { self: "navy", key: "red", other: "line_other", other2: "line_other2" };

export function colorOf(tokens: Tokens, role: string | null | undefined, fallback = "text"): string {
  const r = role || fallback;
  if (r.startsWith("#")) return r;
  const hex = tokens.colors[r];
  return hex ? `#${hex}` : `#${tokens.colors[fallback] ?? "1C1E24"}`;
}

export function resolveWeight(part?: EPart, para?: EParagraph, block?: TextBlock): Weight {
  if (part?.weight) return part.weight;
  if (part?.bold) return "bold";
  if (para?.weight) return para.weight;
  if (para?.bold || block?.bold) return "bold";
  return block?.weight ?? "regular";
}

export function partText(p: EPart) {
  return p.type === "fact" ? p.display ?? "" : p.text ?? "";
}

/** Inline content of one paragraph. Chips (non-text parts) carry data-pi so an edit can keep them. */
export function ParagraphContent({ para, block, tokens, editing, pi0 = 0, chips = true }: { para: EParagraph; block: TextBlock; tokens: Tokens; editing?: boolean; pi0?: number; chips?: boolean }) {
  const base = para.color || block.color;
  const out: ReactNode[] = [];
  if (para.bullet) {
    const onDark = ON_DARK.has(base);
    const bulletColor = para.bullet === "▶" ? "red" : ["┃", "▲"].includes(para.bullet) && !onDark ? "navy" : base;
    const bw = para.bullet === "┃" ? "bold" : resolveWeight(undefined, para, block);
    out.push(
      <span key="b" contentEditable={false} data-bullet="1" style={{ color: colorOf(tokens, bulletColor), fontWeight: WEIGHT[bw] }}>
        {para.bullet}{" "}
      </span>,
    );
  }
  para.parts.forEach((p, i) => {
    const text = partText(p);
    const style: CSSProperties = {
      fontWeight: WEIGHT[resolveWeight(p, para, block)],
      color: colorOf(tokens, p.color || base),
      fontSize: p.size ? p.size * PT : undefined,
      textDecoration: p.type === "link" ? "underline" : undefined,
    };
    if (p.type === "text") {
      out.push(
        <span key={i} data-pi={pi0 + i} style={style}>
          {text}
        </span>,
      );
    } else {
      out.push(
        <span
          key={i}
          data-pi={pi0 + i}
          data-chip={p.type}
          contentEditable={editing ? false : undefined}
          className={chips && p.type === "fact" ? "ed-chip" : chips && editing ? "ed-chip-other" : undefined}
          title={p.type === "fact" ? `근거 수치 ${p.fact_id}` : p.type === "date" ? "날짜" : p.type === "name" ? "고정 이름" : undefined}
          style={style}
        >
          {text}
        </span>,
      );
    }
  });
  if (!out.length) out.push(<br key="br" />);
  return <>{out}</>;
}

export function TextView({ b, tokens, editing, innerRef, onBlur, onKeyDown }: { b: TextBlock; tokens: Tokens; editing?: boolean; innerRef?: (el: HTMLDivElement | null) => void; onBlur?: () => void; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  const r = b.region;
  const rule = b.role === "takeaway" ? ((tokens.regions.takeaway_rule_y as number | undefined) ?? r.y + r.h) : null;
  const justify = b.valign === "m" ? "center" : b.valign === "b" ? "flex-end" : "flex-start";
  return (
    <>
      {rule !== null && <div className="ed-abs" style={{ left: r.x, top: rule - 0.66, width: r.w, height: 1.33, background: colorOf(tokens, "navy") }} />}
      <div
        className="ed-abs ed-text"
        style={{
          left: r.x,
          top: r.y,
          width: r.w,
          height: r.h,
          justifyContent: justify,
          textAlign: b.align === "c" ? "center" : b.align === "r" ? "right" : "left",
          fontSize: b.size * PT,
          lineHeight: `${b.line_spacing * PT}px`,
          color: colorOf(tokens, b.color),
          background: b.fill ? colorOf(tokens, b.fill) : undefined,
          zIndex: editing ? 6 : undefined, // above the editor's hit layer so the caret can be placed by clicking
        }}
      >
        <div
          key={editing ? "edit" : "view" /* remount after editing: the browser mutated this DOM */}
          ref={innerRef}
          className={editing ? "ed-editing" : undefined}
          contentEditable={editing || undefined}
          suppressContentEditableWarning
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          spellCheck={false}
        >
          {b.paragraphs.map((p, i) => (
            <div key={i} data-para={i} style={{ marginTop: (p.space_before ?? 0) * PT }}>
              <ParagraphContent para={p} block={b} tokens={tokens} editing={editing} pi0={b.paragraphs.slice(0, i).reduce((n, q) => n + q.parts.length, 0)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ImageView({ b, assets }: { b: ImageBlock; assets: Record<string, AssetChoice> }) {
  const a = assets[b.asset_id];
  const r = b.region;
  if (!a) {
    return (
      <div className="ed-abs ed-img-missing" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
        이미지
      </div>
    );
  }
  const c = b.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cw = a.width * c.w;
  const ch = a.height * c.h;
  const scale = Math.min(r.w / cw, r.h / ch); // contain, like the renderer
  const w = cw * scale;
  const h = ch * scale;
  return (
    <div className="ed-abs" style={{ left: r.x + (r.w - w) / 2, top: r.y + (r.h - h) / 2, width: w, height: h, overflow: "hidden" }}>
      <img
        src={`${API_URL}/assets/${b.asset_id}/file`}
        alt={a.title}
        draggable={false}
        style={{ position: "absolute", left: -c.x * a.width * scale, top: -c.y * a.height * scale, width: a.width * scale, height: a.height * scale, maxWidth: "none" }}
      />
    </div>
  );
}

function TableView({ b, tokens }: { b: TableBlock; tokens: Tokens }) {
  const r = b.region;
  const total = b.columns.reduce((s, c) => s + c.width, 0) || 1;
  const border = `0.75pt solid ${colorOf(tokens, "table_border")}`;
  const cellBase: CSSProperties = { border, padding: "2px 6px", verticalAlign: "middle", overflow: "hidden" };
  return (
    <table className="ed-abs ed-table" style={{ left: r.x, top: r.y, width: r.w }}>
      <colgroup>
        {b.columns.map((c) => (
          <col key={c.key} style={{ width: `${(c.width / total) * 100}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ height: b.header_height }}>
          {b.columns.map((c) => (
            <th key={c.key} style={{ ...cellBase, background: colorOf(tokens, "navy"), color: "#fff", fontWeight: 600, fontSize: b.header_size * PT, lineHeight: 1.35, textAlign: "center" }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.rows.map((row, ri) => (
          <tr key={ri} style={{ height: b.row_height }}>
            {row.cells.map((cell, ci) => {
              if (cell.merged) return null;
              const col = b.columns[ci];
              const role = cell.color || (row.muted ? "muted" : "text");
              const fake: TextBlock = { kind: "text", block_id: "", role: "body", region: r, paragraphs: [], align: "l", valign: "m", size: b.size, line_spacing: b.size * 1.4, color: role, bold: !!cell.bold };
              const align = cell.align || col?.align || "c";
              return (
                <td
                  key={ci}
                  rowSpan={cell.merge_down ? cell.merge_down + 1 : undefined}
                  style={{ ...cellBase, background: cell.fill ? colorOf(tokens, cell.fill) : "#fff", color: colorOf(tokens, role), fontSize: b.size * PT, lineHeight: 1.4, textAlign: align === "c" ? "center" : align === "r" ? "right" : "left" }}
                >
                  {cell.paragraphs.map((p, i) => (
                    <div key={i}>
                      <ParagraphContent para={p} block={fake} tokens={tokens} chips={false} />
                    </div>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BarChartView({ b, tokens }: { b: Extract<Block, { kind: "bar_chart" }>; tokens: Tokens }) {
  const r = b.region;
  const top = Math.max(1e-9, ...b.items.map((i) => i.value)) * 1.12;
  const labelW = Math.min(150, r.w * 0.32);
  const rowH = r.h / Math.max(1, b.items.length);
  const barH = rowH * 0.64;
  return (
    <svg className="ed-abs" style={{ left: r.x, top: r.y }} width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`}>
      {b.items.map((it, i) => {
        const y = i * rowH + (rowH - barH) / 2;
        const w = ((r.w - labelW - 8) * it.value) / top;
        const inside = it.value / top >= 0.22;
        return (
          <g key={i}>
            <text x={labelW - 6} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={b.label_size * PT} fill={colorOf(tokens, "text")}>
              {it.label}
            </text>
            <rect x={labelW} y={y} width={Math.max(1, w)} height={barH} fill={colorOf(tokens, BAR_ROLE[it.role] ?? "bar_other")} />
            <text x={inside ? labelW + w - 6 : labelW + w + 6} y={y + barH / 2} textAnchor={inside ? "end" : "start"} dominantBaseline="middle" fontWeight={700} fontSize={(b.label_size + 0.5) * PT} fill={inside ? "#fff" : colorOf(tokens, "text")}>
              {it.display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChartView({ b, tokens }: { b: Extract<Block, { kind: "line_chart" }>; tokens: Tokens }) {
  const r = b.region;
  const vals = b.series.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v !== null));
  const max = (Math.max(1e-9, ...vals) || 1) * 1.1;
  const padT = 26;
  const padB = 22;
  const n = Math.max(1, b.categories.length - 1);
  const x = (i: number) => 16 + ((r.w - 32) * i) / n;
  const y = (v: number) => padT + (r.h - padT - padB) * (1 - v / max);
  return (
    <svg className="ed-abs" style={{ left: r.x, top: r.y }} width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`}>
      {b.series.map((s, si) => {
        const c = colorOf(tokens, LINE_ROLE[s.role] ?? "line_other");
        const segs: string[] = [];
        let cur = "";
        s.points.forEach((p, i) => {
          if (p.value === null) {
            if (cur) segs.push(cur);
            cur = "";
          } else cur += `${cur ? "L" : "M"}${x(i)},${y(p.value)} `;
        });
        if (cur) segs.push(cur);
        return (
          <g key={si}>
            {segs.map((d, k) => (
              <path key={k} d={d} fill="none" stroke={c} strokeWidth={s.role === "self" || s.role === "key" ? 3.3 : 2.6} />
            ))}
            {s.points.map((p, i) => (p.value === null ? null : <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={c} />))}
            <text x={16 + si * 110} y={12} fontSize={12} fill={c} fontWeight={600}>
              ● {s.entity}
            </text>
          </g>
        );
      })}
      {b.categories.map((c, i) => (
        <text key={i} x={x(i)} y={r.h - 4} fontSize={12.6} textAnchor="middle" fill={colorOf(tokens, "subtle")}>
          {c}
        </text>
      ))}
    </svg>
  );
}

export function BlockView({ b, tokens, assets, editing, textRef, onTextBlur, onTextKey }: { b: Block; tokens: Tokens; assets: Record<string, AssetChoice>; editing?: boolean; textRef?: (el: HTMLDivElement | null) => void; onTextBlur?: () => void; onTextKey?: (e: React.KeyboardEvent) => void }) {
  const r = b.region;
  switch (b.kind) {
    case "text":
      return <TextView b={b} tokens={tokens} editing={editing} innerRef={textRef} onBlur={onTextBlur} onKeyDown={onTextKey} />;
    case "shape":
      if (b.block_id === "bg") return null;
      if (b.shape === "line") {
        const w = Math.max(r.w, 1);
        const h = Math.max(r.h, 1);
        return (
          <svg className="ed-abs" style={{ left: r.x, top: r.y, overflow: "visible" }} width={w} height={h}>
            <line x1={0} y1={0} x2={r.w} y2={r.h} stroke={colorOf(tokens, b.line || "muted")} strokeWidth={b.line_width * PT} />
          </svg>
        );
      }
      return (
        <div
          className="ed-abs"
          style={{
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: b.fill ? colorOf(tokens, b.fill) : "transparent",
            border: b.line ? `${b.line_width * PT}px solid ${colorOf(tokens, b.line)}` : undefined,
            borderRadius: b.shape === "rounded" ? Math.min(r.w, r.h) * 0.18 : 0,
            boxSizing: "border-box",
          }}
        />
      );
    case "image":
      return <ImageView b={b} assets={assets} />;
    case "table":
      return <TableView b={b} tokens={tokens} />;
    case "bar_chart":
      return <BarChartView b={b} tokens={tokens} />;
    case "line_chart":
      return <LineChartView b={b} tokens={tokens} />;
  }
}

export function slideBackground(slide: Slide, tokens: Tokens) {
  const bg = slide.blocks.find((b) => b.kind === "shape" && b.block_id === "bg") as Extract<Block, { kind: "shape" }> | undefined;
  return bg ? colorOf(tokens, bg.fill || "black") : "#FFFFFF";
}

/** Static slide (thumbnails, present mode). */
export function SlideView({ slide, tokens, assets, scale }: { slide: Slide; tokens: Tokens; assets: Record<string, AssetChoice>; scale: number }) {
  const { w, h } = tokens.canvas;
  return (
    <div style={{ width: w * scale, height: h * scale, overflow: "hidden", position: "relative" }}>
      <div className="ed-slide" style={{ width: w, height: h, transform: `scale(${scale})`, background: slideBackground(slide, tokens) }}>
        {slide.blocks.map((b) => (
          <BlockView key={b.block_id} b={b} tokens={tokens} assets={assets} />
        ))}
      </div>
    </div>
  );
}

export const FONT_CSS = `
@font-face { font-family: "PTK Pretendard"; font-weight: 300; src: url(${API_URL}/fonts/Pretendard-Light.otf) format("opentype"); font-display: swap; }
@font-face { font-family: "PTK Pretendard"; font-weight: 400; src: url(${API_URL}/fonts/Pretendard-Regular.otf) format("opentype"); font-display: swap; }
@font-face { font-family: "PTK Pretendard"; font-weight: 600; src: url(${API_URL}/fonts/Pretendard-SemiBold.otf) format("opentype"); font-display: swap; }
@font-face { font-family: "PTK Pretendard"; font-weight: 700; src: url(${API_URL}/fonts/Pretendard-Bold.otf) format("opentype"); font-display: swap; }
@font-face { font-family: "PTK Pretendard"; font-weight: 800; src: url(${API_URL}/fonts/Pretendard-ExtraBold.otf) format("opentype"); font-display: swap; }
`;
