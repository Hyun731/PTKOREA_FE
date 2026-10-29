// SlideSpec as the editor sees it (mirrors core/schemas/slidespec.py). Coordinates are canvas
// units (1280×720, 1 unit = 1px at 96dpi); font sizes are pt.

export type Weight = "light" | "regular" | "semibold" | "bold" | "heavy";

export type EPart = {
  type: "text" | "fact" | "meta" | "date" | "name" | "link" | "quote";
  text?: string | null;
  fact_id?: string | null;
  formatter?: string | null;
  display?: string | null;
  key?: string | null;
  href?: string | null;
  bold?: boolean;
  color?: string | null;
  size?: number | null;
  weight?: Weight | null;
};

export type EParagraph = { parts: EPart[]; bullet?: string | null; color?: string | null; bold?: boolean; weight?: Weight | null; space_before?: number };

export type Region = { x: number; y: number; w: number; h: number };

export type TextBlock = {
  kind: "text";
  block_id: string;
  role: string;
  region: Region;
  paragraphs: EParagraph[];
  align: "l" | "c" | "r";
  valign: "t" | "m" | "b";
  size: number;
  line_spacing: number;
  color: string;
  bold: boolean;
  weight?: Weight | null;
  fill?: string | null;
  max_lines?: number | null;
  editable?: boolean;
};

export type ShapeBlock = { kind: "shape"; block_id: string; region: Region; shape: "rect" | "rounded" | "line"; fill?: string | null; line?: string | null; line_width: number };
export type ImageBlock = { kind: "image"; block_id: string; region: Region; asset_id: string; crop: { x: number; y: number; w: number; h: number } };
export type TableCell = { paragraphs: EParagraph[]; fill?: string | null; bold?: boolean; color?: string | null; align?: "l" | "c" | "r" | null; merge_down?: number; merged?: boolean };
export type TableBlock = {
  kind: "table";
  block_id: string;
  region: Region;
  columns: { key: string; label: string; width: number; align: "l" | "c" | "r" }[];
  rows: { cells: TableCell[]; muted?: boolean }[];
  size: number;
  header_size: number;
  header_height: number;
  row_height: number;
};
export type BarChartBlock = { kind: "bar_chart"; block_id: string; region: Region; items: { entity: string; label: string; fact_id: string; display: string; value: number; role: string }[]; label_size: number };
export type LineChartBlock = { kind: "line_chart"; block_id: string; region: Region; categories: string[]; series: { entity: string; role: string; points: { month: string; value: number | null }[] }[] };

export type Block = TextBlock | ShapeBlock | ImageBlock | TableBlock | BarChartBlock | LineChartBlock;

export type Slide = {
  slide_id: string;
  version?: number;
  template_id: string;
  page_role: string;
  section_id?: string | null;
  chapter?: string | null; // 3C part the page sits in
  brand_id?: string | null;
  title: string;
  blocks: Block[];
  bindings: { block_id: string; fact_id: string; metric: string; unit: string; formatter: string; display: string; entity?: string | null }[];
  finding_ids: string[];
  asset_ids: string[];
  source_ids: string[];
  notes: string;
  speaker_notes?: string;
  parent_slide_id?: string | null;
  page_no?: number | null;
  needs_review?: boolean;
  is_data?: boolean;
};

export type QCIssue = { code: string; severity: "block" | "warn"; message: string; action: string; slide_id: string | null; block_id: string | null };
export type QC = { blocks: number; warns: number; issues: QCIssue[] };

export type Tokens = { canvas: { w: number; h: number }; colors: Record<string, string>; regions: Record<string, unknown>; min_font_pt: number };

export type EditOut = {
  deck_id: string;
  deck_version: number;
  project_id: string;
  project_name: string;
  title: string;
  edit_version: number;
  edited: boolean;
  edited_at: string | null;
  stale: boolean;
  slides: Slide[];
  qc: QC;
  ai: { available: boolean; modes: ("claude" | "mock")[] };
};

/** A marked area, relative to the slide (0..1) so zoom never moves it. */
export type Area = { id: string; slide_id: string; x: number; y: number; w: number; h: number };

export type AiOut = {
  mode: "claude" | "mock";
  reply: string;
  scope: Scope;
  target: { slide_ids: string[]; element_ids: Record<string, string[]> };
  applied: { index: number; op: string; slide_id: string; element_id: string | null; summary: string; reason: string }[];
  rejected: { op: string | null; slide_id?: string; element_id?: string | null; reason: string }[];
  changed: Record<string, string[]>;
  slides: Slide[];
  qc: QC | null;
  usage: { cost_usd: number } | null;
  log_id: string;
};

/** Server-side editor history: AI edits (applied / cancelled), restores, resets. */
export type EditLogEntry = {
  id: string;
  short: string; // commit-hash style handle (7 hex)
  restored_from_short: string | null;
  kind: "ai" | "restore" | "reset";
  status: "proposed" | "applied" | "cancelled";
  message: string;
  reply: string;
  mode: "claude" | "mock" | null;
  scope: Scope | null;
  slide_ids: string[];
  applied: { op: string; slide_id: string; element_id: string | null; summary: string }[];
  rejected: { reason: string }[];
  cost_usd: number;
  edit_version: number | null;
  restored_from: string | null;
  created_at: string;
  can_restore_after: boolean;
  can_restore_before: boolean;
};

export type Scope = "selection" | "slide" | "deck";
export type AssetChoice = { id: string; title: string; width: number; height: number; review_status: string };
