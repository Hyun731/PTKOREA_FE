// Pure edit helpers for direct manipulation. AI edits go through the server's command executor;
// these mirror the same field semantics for edits made by hand.

import type { Block, EParagraph, EPart, Region, Slide, TextBlock, Weight } from "./types";

export const CANVAS = { w: 1280, h: 720 };

export function uid(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function clampRegion(r: Region): Region {
  const w = Math.min(Math.max(r.w, 4), CANVAS.w);
  const h = Math.min(Math.max(r.h, 1), CANVAS.h);
  const x = Math.min(Math.max(r.x, 0), CANVAS.w - w);
  const y = Math.min(Math.max(r.y, 0), CANVAS.h - h);
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

const round = (v: number) => Math.round(v * 10) / 10;

export function newBlockId(slide: Slide, prefix: string) {
  const used = new Set(slide.blocks.map((b) => b.block_id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function mapSlide(slides: Slide[], slideId: string, fn: (s: Slide) => Slide): Slide[] {
  return slides.map((s) => (s.slide_id === slideId ? fn(clone(s)) : s));
}

export function mapBlocks(slide: Slide, ids: Set<string>, fn: (b: Block) => Block): Slide {
  return { ...slide, blocks: slide.blocks.map((b) => (ids.has(b.block_id) ? fn(b) : b)) };
}

export function setRegions(slide: Slide, regions: Record<string, Region>): Slide {
  return { ...slide, blocks: slide.blocks.map((b) => (regions[b.block_id] ? { ...b, region: clampRegion(regions[b.block_id]) } : b)) };
}

export function scaleText(b: TextBlock, size: number): TextBlock {
  const ratio = b.size ? size / b.size : 1;
  return {
    ...b,
    size: round(size),
    line_spacing: round(b.line_spacing * ratio),
    paragraphs: b.paragraphs.map((p) => ({ ...p, parts: p.parts.map((x) => (x.size ? { ...x, size: round(x.size * ratio) } : x)) })),
  };
}

export function setTextColor(b: TextBlock, color: string): TextBlock {
  return { ...b, color, paragraphs: b.paragraphs.map((p) => ({ ...p, color: null, parts: p.parts.map((x) => (x.type === "link" ? x : { ...x, color: null })) })) };
}

export function setWeight(b: TextBlock, weight: Weight): TextBlock {
  return {
    ...b,
    weight,
    bold: false,
    paragraphs: b.paragraphs.map((p) => ({ ...p, weight: null, bold: false, parts: p.parts.map((x) => (x.type === "fact" ? x : { ...x, weight: null, bold: false })) })),
  };
}

export function textBox(slide: Slide, at: Region, text = "텍스트를 입력하세요"): TextBlock {
  return {
    kind: "text",
    block_id: newBlockId(slide, "text_"),
    role: "body",
    region: clampRegion(at),
    paragraphs: [{ parts: [{ type: "text", text }] }],
    align: "l",
    valign: "t",
    size: 14,
    line_spacing: 20,
    color: "text",
    bold: false,
    weight: "regular",
    fill: null,
    editable: true,
  };
}

export function shapeBox(slide: Slide, at: Region, shape: "rect" | "rounded" | "line"): Block {
  return {
    kind: "shape",
    block_id: newBlockId(slide, "shape_"),
    region: clampRegion(shape === "line" ? { ...at, h: 1 } : at),
    shape,
    fill: shape === "line" ? null : "tint",
    line: shape === "line" ? "navy" : null,
    line_width: shape === "line" ? 1.25 : 0.75,
  };
}

export function blankSlide(): Slide {
  const id = uid("S-new-");
  return {
    slide_id: id,
    template_id: "blank.v1",
    page_role: "content",
    title: "새 슬라이드",
    blocks: [
      { kind: "shape", block_id: "chrome_band", region: { x: 0, y: 0, w: 1280, h: 7 }, shape: "rect", fill: "navy", line: null, line_width: 0.75 },
      {
        kind: "text",
        block_id: "lead",
        role: "lead",
        region: { x: 48, y: 59, w: 1184, h: 61 },
        paragraphs: [{ parts: [{ type: "text", text: "새 슬라이드 제목" }] }],
        align: "l",
        valign: "t",
        size: 16.5,
        line_spacing: 22,
        color: "navy",
        bold: false,
        weight: "bold",
        editable: true,
      },
      { kind: "shape", block_id: "chrome_rule", region: { x: 48, y: 667, w: 1184, h: 0 }, shape: "line", fill: null, line: "rule", line_width: 0.75 },
    ],
    bindings: [],
    finding_ids: [],
    asset_ids: [],
    source_ids: [],
    notes: "",
    is_data: false,
  };
}

export function duplicateSlide(s: Slide): Slide {
  const c = clone(s);
  c.slide_id = `${s.slide_id.replace(/-copy-[a-z0-9]+$/, "")}-copy-${Math.random().toString(36).slice(2, 6)}`;
  c.parent_slide_id = s.slide_id;
  return c;
}

/** Plain text shown for a slide (thumbnail label / panel). */
export function slideLabel(s: Slide) {
  const lead = s.blocks.find((b) => b.kind === "text" && ["lead", "cover_title", "divider_title"].includes(b.role)) as TextBlock | undefined;
  const t = lead?.paragraphs.map((p) => p.parts.map((x) => (x.type === "fact" ? x.display : x.text) ?? "").join("")).join(" ").trim();
  return t || s.title;
}

/**
 * contentEditable DOM -> paragraphs. Chips (data-pi on a non-text part) come back as the original
 * part objects, so an edit by hand can rewrite words but never retype a number chip.
 */
export function parseEdited(root: HTMLElement, original: TextBlock): EParagraph[] {
  const flat: EPart[] = original.paragraphs.flatMap((p) => p.parts);
  const paras: EParagraph[] = [];
  // Each <div> is a paragraph; loose nodes (typed outside any div) form a paragraph of their own.
  const groups: Node[][] = [];
  let loose: Node[] | null = null;
  root.childNodes.forEach((node) => {
    if (node.nodeType === 1 && (node as HTMLElement).tagName === "DIV") {
      loose = null;
      groups.push([node]);
    } else {
      if (!loose) {
        loose = [];
        groups.push(loose);
      }
      loose.push(node);
    }
  });
  groups.forEach((group, gi) => {
    const first = group[0] as HTMLElement;
    const srcIndex = first.nodeType === 1 && first.dataset?.para !== undefined ? Number(first.dataset.para) : null;
    const base = original.paragraphs[srcIndex ?? Math.min(gi, original.paragraphs.length - 1)] ?? { parts: [] };
    const parts: EPart[] = [];
    const pushText = (t: string, like?: EPart) => {
      if (!t) return;
      const last = parts[parts.length - 1];
      if (last && last.type === "text" && !like) last.text = (last.text ?? "") + t;
      else parts.push({ ...(like && like.type === "text" ? like : { type: "text" as const }), type: "text", text: t });
    };
    const walk = (n: Node) => {
      if (n.nodeType === 3) {
        pushText(n.textContent ?? "");
        return;
      }
      if (n.nodeType !== 1) return;
      const el = n as HTMLElement;
      if (el.dataset.bullet) return;
      if (el.tagName === "BR") return;
      if (el.dataset.pi !== undefined) {
        const orig = flat[Number(el.dataset.pi)];
        if (orig && orig.type !== "text") {
          parts.push(clone(orig));
          return;
        }
        if (orig) {
          pushText(el.textContent ?? "", orig);
          return;
        }
      }
      el.childNodes.forEach(walk);
    };
    group.forEach((n) => (n.nodeType === 1 && (n as HTMLElement).tagName === "DIV" ? n.childNodes.forEach(walk) : walk(n)));
    // merge adjacent plain text parts that share style
    const merged: EPart[] = [];
    for (const p of parts) {
      const last = merged[merged.length - 1];
      if (last && last.type === "text" && p.type === "text" && !!last.bold === !!p.bold && last.color === p.color && last.size === p.size && last.weight === p.weight) last.text = (last.text ?? "") + (p.text ?? "");
      else merged.push(p);
    }
    paras.push({ ...base, parts: merged });
  });
  return paras.length ? paras : [{ ...(original.paragraphs[0] ?? {}), parts: [] }];
}

export function hasBareDigits(b: Block) {
  return b.kind === "text" && b.paragraphs.some((p) => p.parts.some((x) => x.type === "text" && /\d/.test(x.text ?? "")));
}
