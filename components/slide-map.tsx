"use client";

import type { SlideKind } from "@/lib/impact";

// Simplified wireframes of the real templates (16:9, 320×180). Region keys match lib/impact.ts.
type El = { key: string; x: number; y: number; w: number; h: number; t: "text" | "img" | "bar" | "band" | "box" | "line" | "head" | "dark" | "row" | "cell" };

const chrome = (lead = true): El[] => [
  { key: "title", x: 12, y: 9, w: 70, h: 7, t: "text" },
  ...(lead ? [{ key: "lead", x: 50, y: 24, w: 220, h: 7, t: "text" } as El] : []),
  { key: "footnote", x: 170, y: 168, w: 138, h: 3.5, t: "text" },
];

const card = (x: number): El[] => [
  { key: "card.frame", x, y: 48, w: 94, h: 108, t: "box" },
  { key: "card.label", x: x + 20, y: 44, w: 54, h: 8, t: "head" },
  { key: "card.image", x: x + 7, y: 58, w: 80, h: 42, t: "img" },
  { key: "card.link", x: x + 22, y: 104, w: 50, h: 4, t: "text" },
  { key: "card.metrics", x: x + 7, y: 112, w: 56, h: 4, t: "text" },
  { key: "card.desc", x: x + 7, y: 121, w: 80, h: 9, t: "text" },
  { key: "card.impl", x: x + 7, y: 135, w: 66, h: 5, t: "text" },
];

const LAYOUTS: Record<Exclude<SlideKind, "none">, El[]> = {
  cover: [
    { key: "bg", x: 0, y: 0, w: 320, h: 180, t: "dark" },
    { key: "cover.client", x: 110, y: 72, w: 100, h: 9, t: "text" },
    { key: "cover.name", x: 95, y: 86, w: 130, h: 9, t: "text" },
    { key: "cover.date", x: 140, y: 140, w: 40, h: 5, t: "text" },
  ],
  index: [
    { key: "bg", x: 0, y: 0, w: 320, h: 180, t: "dark" },
    { key: "index.label", x: 34, y: 30, w: 40, h: 9, t: "text" },
    { key: "index.items", x: 100, y: 32, w: 110, h: 60, t: "text" },
  ],
  share: [
    ...chrome(),
    { key: "panel.header", x: 116, y: 46, w: 88, h: 9, t: "head" },
    { key: "bars.labels", x: 84, y: 64, w: 22, h: 40, t: "text" },
    { key: "bars.self", x: 110, y: 63, w: 110, h: 10, t: "bar" },
    { key: "bars.rival", x: 110, y: 78, w: 96, h: 10, t: "bar" },
    { key: "bars.other", x: 110, y: 93, w: 66, h: 10, t: "bar" },
    { key: "caption", x: 120, y: 112, w: 80, h: 7, t: "text" },
    { key: "takeaway", x: 12, y: 140, w: 296, h: 11, t: "band" },
  ],
  combo: [
    ...chrome(),
    { key: "panel.header", x: 116, y: 46, w: 88, h: 9, t: "head" },
    { key: "bars.rival", x: 110, y: 63, w: 110, h: 10, t: "bar" },
    { key: "bars.other", x: 110, y: 78, w: 80, h: 10, t: "bar" },
    { key: "bars.self", x: 110, y: 93, w: 40, h: 10, t: "bar" },
    { key: "caption", x: 120, y: 112, w: 80, h: 7, t: "text" },
    { key: "takeaway", x: 12, y: 140, w: 296, h: 11, t: "band" },
  ],
  trend: [
    ...chrome(),
    { key: "panel.header", x: 116, y: 42, w: 88, h: 9, t: "head" },
    { key: "lines", x: 70, y: 60, w: 180, h: 46, t: "line" },
    { key: "caption", x: 120, y: 114, w: 80, h: 7, t: "text" },
    { key: "takeaway", x: 12, y: 140, w: 296, h: 11, t: "band" },
  ],
  target: [
    ...chrome(),
    { key: "table.header", x: 18, y: 66, w: 284, h: 8, t: "head" },
    { key: "table.rows", x: 18, y: 75, w: 284, h: 30, t: "row" },
    { key: "table.target", x: 136, y: 75, w: 52, h: 10, t: "cell" },
    { key: "takeaway", x: 12, y: 140, w: 296, h: 11, t: "band" },
  ],
  creator: [
    ...chrome(),
    { key: "table.label", x: 70, y: 42, w: 180, h: 7, t: "head" },
    { key: "table.header", x: 18, y: 53, w: 284, h: 7, t: "head" },
    { key: "table.rows", x: 18, y: 61, w: 284, h: 56, t: "row" },
    { key: "takeaway", x: 12, y: 140, w: 296, h: 11, t: "band" },
  ],
  case: [...chrome(), ...card(16), ...card(113), ...card(210)],
  market: [
    ...chrome(),
    { key: "table.header", x: 18, y: 48, w: 284, h: 8, t: "head" },
    { key: "table.rows", x: 18, y: 57, w: 284, h: 60, t: "row" },
  ],
  recap: [
    { key: "title", x: 12, y: 9, w: 40, h: 7, t: "text" },
    ...[30, 120, 210].flatMap((x) => [
      { key: "pillar.head", x, y: 70, w: 80, h: 18, t: "dark" } as El,
      { key: "pillar.body", x, y: 92, w: 80, h: 30, t: "box" } as El,
    ]),
    { key: "footnote", x: 200, y: 168, w: 108, h: 3.5, t: "text" },
  ],
  source: [
    ...chrome(),
    { key: "table.header", x: 18, y: 44, w: 284, h: 8, t: "head" },
    { key: "src.title", x: 18, y: 53, w: 84, h: 60, t: "row" },
    { key: "src.date", x: 102, y: 53, w: 34, h: 60, t: "row" },
    { key: "src.url", x: 136, y: 53, w: 166, h: 60, t: "row" },
  ],
};

const FILL: Record<El["t"], string> = {
  text: "#d5dae3",
  img: "#c3cad6",
  bar: "#c9c9c9",
  band: "#fff3dc",
  box: "#ffffff",
  line: "transparent",
  head: "#b9bfc9",
  dark: "#1d2230",
  row: "#eef1f5",
  cell: "#fff2cc",
};

export function SlideMap({ kind, regions, label }: { kind: SlideKind; regions: string[]; label: string }) {
  if (kind === "none") return null;
  const els = LAYOUTS[kind];
  const hot = new Set(regions);
  const dark = els.some((e) => e.key === "bg");
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label={label} className="slide-map">
      <rect x="0.5" y="0.5" width="319" height="179" rx="4" fill={dark ? "#111" : "#fff"} stroke="#cfd5de" />
      {els.map((e, i) => {
        if (e.key === "bg") return null;
        const on = hot.has(e.key);
        if (e.t === "line") {
          const pts = (o: number) => Array.from({ length: 9 }, (_, k) => `${e.x + (k * e.w) / 8},${e.y + e.h / 2 + Math.sin((k + o) / 1.7) * (e.h / 3) + o * 3}`).join(" ");
          return (
            <g key={i}>
              <polyline points={pts(0)} fill="none" stroke={on ? "#2e4a8b" : "#9aa3b2"} strokeWidth={on ? 3 : 2} />
              <polyline points={pts(3)} fill="none" stroke={on ? "#e2001a" : "#c4cad4"} strokeWidth={on ? 3 : 2} />
            </g>
          );
        }
        let fill = FILL[e.t];
        if (e.key === "bars.self") fill = "#2e4a8b";
        if (e.key === "bars.rival") fill = "#e2001a";
        if (dark && e.t === "text") fill = "#4b5263";
        return (
          <g key={i}>
            <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={e.t === "bar" || e.t === "head" ? 2 : 1.5} fill={on ? "#2e4a8b" : fill} fillOpacity={on ? 0.9 : 1} stroke={on ? "#1f6feb" : e.t === "box" ? "#d4d9e1" : "none"} strokeWidth={on ? 2.5 : 1} />
            {e.t === "img" && !on && <path d={`M${e.x} ${e.y + e.h} L${e.x + e.w * 0.4} ${e.y + e.h * 0.45} L${e.x + e.w * 0.65} ${e.y + e.h * 0.75} L${e.x + e.w} ${e.y + e.h * 0.35}`} fill="none" stroke="#aab2c0" strokeWidth="1.5" />}
          </g>
        );
      })}
    </svg>
  );
}
