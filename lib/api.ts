// Thin client for the /v1 API. The server is the source of truth: screens refetch after
// every mutation instead of keeping their own copies (DEVELOPMENT_PLAN 4 화면과 조사 계획).

// Same-origin by default: next.config.mjs proxies /v1 to the API server (works through tunnels too).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public action: string = "",
    public detail: unknown = null,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: isForm || body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "API 서버에 연결할 수 없습니다", "API 서버 실행 상태를 확인하세요");
  }
  if (!res.ok) {
    let err: { code?: string; message?: string; action?: string; detail?: unknown } = {};
    try {
      err = (await res.json()).error ?? {};
    } catch {
      /* non-JSON error */
    }
    if (res.status === 422 && !err.code) err = { code: "INVALID_INPUT", message: "입력값을 확인하세요" };
    throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? `요청 실패 (${res.status})`, err.action ?? "", err.detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(p: string) => request<T>("GET", p),
  post: <T,>(p: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", p, body, headers),
  put: <T,>(p: string, body?: unknown) => request<T>("PUT", p, body),
  patch: <T,>(p: string, body?: unknown) => request<T>("PATCH", p, body),
  del: <T,>(p: string) => request<T>("DELETE", p),
};

export const fileUrl = (path: string) => `${API_URL}${path}`;

// ---------------------------------------------------------------- types (mirror API payloads)

export type Brand = {
  id: string;
  name: string;
  aliases: string[];
  categories: string[];
  target: { age_min: number | null; age_max: number | null; gender: "all" | "female" | "male"; label: string } | null;
  competitors: string[];
  benchmarks: string[];
  keyword_groups: { entity: string; keywords: string[] }[];
};

export type SectionWindow = { section_id: string; label: string; start: string; end: string; source: string };

// 조사 범위 (팩트북 표준 목차): one setting per item; unset fields use the catalog default.
export type ScopeSetting = {
  item_id: string;
  enabled: boolean;
  period: "inherit" | "months" | "custom";
  months: number | null;
  start?: string | null;
  end?: string | null;
  channels: string[] | null;
  targets: string[] | null;
  max_items: number | null;
  focus?: string | null;
  keywords?: string[];
};
export type ScopeResolved = ScopeSetting & { start: string; end: string; channels: string[]; keywords: string[]; automation: "auto" | "manual" | "generated" };
export type ScopeEntry = ScopeResolved & { direction: string[] };
export type ScopePart = { id: string; no: string; label: string; en: string; question: string };
export type ScopeSpec = {
  id: string;
  part: string;
  group: string;
  title: string;
  question: string;
  subject: "self" | "competitor" | "benchmark" | "market";
  collector: string | null;
  templates: string[];
  channels: string[];
  uploads: string[];
  from: string[];
  output: string;
};

export type ProjectConfig = {
  name: string;
  client: string;
  timezone: string;
  period: { start: string; end: string };
  brands: Brand[];
  enabled_slides: string[];
  report_profile: string;
  collection_cutoff: string | null;
  section_windows: SectionWindow[];
  scope: ScopeSetting[];
  target_hypothesis: string | null;
  import_defaults_applied: string[];
};

export type ProjectOut = {
  id: string;
  name: string;
  client: string;
  version: number;
  config: ProjectConfig;
  omitted_slots: Record<string, { reason: string; by: string; at: string }>;
  comparison_window: { label: string; start: string; end: string };
  counts: {
    materials: number;
    materials_accepted: number;
    materials_candidate: number;
    batches: number;
    batches_pending: number;
    claims_pending: number;
    claims_stale: number;
    facts_pending: number;
    decks: number;
    exports: number;
    items?: number;
    items_reviewed?: number;
    plan_confirmed?: number;
  };
  updated_at: string;
};

export type Channel = { id: string; label: string; support: "auto" | "manual_only" | "unsupported"; provider: string | null; status: "ready" | "key_missing" | "manual_only" };

export type ResearchItem = {
  id: string;
  brand_id: string;
  entity: string;
  role: "self" | "competitor" | "benchmark" | "market";
  section_id: string;
  scope_id: string | null;
  question: string;
  period_start: string;
  period_end: string;
  channels: Channel[];
  required: boolean;
  selected: boolean;
  execution_status: string;
  review_status: "pending" | "accepted" | "excluded" | "stale";
  omission_reason: string | null;
  coverage: { materials: number; accepted: number; duplicates?: number };
  inputs: { post_urls?: string[]; hashtags?: string[] };
  last_result: ItemResult;
  latest_job_id: string | null;
};

export type ItemResult = {
  status?: string;
  created?: number;
  pages?: number;
  images?: number;
  claims?: number;
  facts?: number;
  posts?: number;
  skipped_existing?: number;
  out_of_period?: number;
  off_topic?: number;
  discovered?: { hashtags: string[]; found: number; in_period_creator: number; added: number; out_of_period: number; official: number; duplicate: number };
  duplicates?: number;
  batch_id?: string;
  dropped?: string[];
  errors?: { code: string; message: string }[];
  reason?: string;
  at?: string;
};

export type Usage = { budget_per_run_usd: number; total_cost_usd: number; providers: Record<string, { calls: number; cache_hits: number; failed: number; cost_usd: number; estimated: boolean }> };

export type LeadProposal = { id: string; slide_id: string; slide_title: string; current: { parts: Part[] }[]; parts: Part[]; status: "pending" | "accepted" | "rejected" | "failed"; attempts: number; errors: string[]; model: string | null; created_at: string };

// 초안 흐름: the deck read as text (sections and slides in order).
export type OutlineSlide = { kind: "slide"; slide_id: string; page_no: number | null; title: string; page_role: string; section: string; lead: string; points: string[]; source: string; slot_id: string | null; edited: boolean; continued: boolean };
export type OutlineSection = { kind: "section"; title: string; subtitle: string; page_no: number | null };
export type Outline = { flow: (OutlineSlide | OutlineSection)[]; pages: number; missing: { slot_id: string; label: string; reason: string | null }[]; omitted: { slot_id: string; label: string; reason: string | null }[]; fingerprint: string };

export type ResearchPlan = { id: string; version: number; confirmed_at: string | null; scope: ScopeEntry[]; items: ResearchItem[] };

export type Part = { type: "text" | "fact" | "meta" | "date" | "name" | "link"; text?: string | null; display?: string | null; fact_id?: string | null; formatter?: string | null; href?: string | null; bold?: boolean };

export type Claim = { id: string; kind: "fact" | "interpretation" | "recommendation"; parts: Part[]; text: string; fact_ids: string[]; author: string; quote?: string | null; review_status: "pending" | "accepted" | "excluded" | "stale"; stale_reason: string | null; version: number; issues: string[] };

export type Crop = { x: number; y: number; w: number; h: number };

export type Asset = { id: string; version: number; width: number; height: number; mime_type: string; crop: Crop; crop_history: { version: number; crop: Crop; at: string }[]; title: string; description: string; usage_basis: string; review_status: "candidate" | "accepted" | "excluded" };

export type FactOut = { id: string; origin: string; metric: string; label: string | null; entity: string; value: string | null; unit: string; display: string | null; measured_at: string; source: string; verification_status: string; superseded_by: string | null; review_note: string | null; token: string };

export type Material = {
  id: string;
  version: number;
  title: string;
  label: string | null;
  brand_id: string | null;
  entity: string | null;
  section_id: string;
  comment: string;
  excerpt: string;
  input_path: "auto" | "manual";
  review_status: "candidate" | "accepted" | "excluded";
  review_reason: string | null;
  activity_date: string | null;
  activity_date_end: string | null;
  research_item_id: string | null;
  selected_asset_id: string | null;
  source: { id: string; title: string; url: string | null; publisher: string | null; published_at: string | null; access_status: string };
  assets: Asset[];
  claims: Claim[];
  facts: FactOut[];
  readiness: string[];
  duplicate_of: string | null;
  duplicate_reason: string | null;
  event_name: string | null;
  summary: string | null; // 해석 요약: what was done, why, how it landed
  scope_id: string | null; // its item in the 3C plan
  role: "self" | "competitor" | "benchmark" | "market" | null;
  featured: boolean;
  duplicates: { id: string; title: string; reason: string | null; url: string | null; publisher: string | null; published_at: string | null; review_status: string }[];
  updated_at: string;
};

export type Batch = { id: string; kind: "facts" | "posts"; filename: string; status: string; total_rows: number; valid_rows: number; errors: { row_no: number; column: string | null; code: string; message: string }[]; duplicates: unknown[]; synthetic: boolean; reviewed_by: string | null; created_at: string };

export type QCIssue = { code: string; severity: "block" | "warn"; message: string; action: string; slide_id: string | null; block_id: string | null };
export type QC = { blocks: number; warns: number; issues: QCIssue[] };

export type Slot = { slot_id: string; section_id: string; template_id: string; brand_id: string | null; label: string; readiness: "ready" | "needs_input" | "omitted"; reason: string | null; slide_ids: string[] };

export type SlidePlanOut = {
  plan: Slot[];
  counts: { planned: number; generated: number; omitted: number; needs_input: number; pages: number };
  pages: { slide_id: string; title: string; page_role: string; section_id: string | null; needs_review: boolean }[];
  qc: QC;
  findings: { id: string; rule_id: string; brand_id: string; strength: string; expression: string }[];
  metric_issues: { code: string; message: string; brand_id: string | null }[];
  synthetic_data: boolean;
};

export type Job = { id: string; kind: string; state: string; progress: number; result: Record<string, unknown>; error_code: string | null; error_message: string | null; created_at: string; finished_at: string | null };

export type Binding = { block_id: string; fact_id: string; entity: string | null; metric: string; unit: string; formatter: string; display: string };
export type SlideSpec = { slide_id: string; version: number; template_id: string; page_role: string; section_id: string | null; title: string; blocks: { kind: string; block_id: string; role?: string; paragraphs?: { parts: Part[]; bullet?: string | null }[] }[]; bindings: Binding[]; finding_ids: string[]; asset_ids: string[]; source_ids: string[]; notes: string; parent_slide_id: string | null; page_no: number | null; needs_review: boolean; is_data: boolean };

export type DeckOut = { id: string; version: number; status: string; qc: QC | null; render_status: string; render_message: string | null; pages: number; job_id: string | null; created_at: string; stale: boolean; spec?: { slides: SlideSpec[]; plan: Slot[]; synthetic_data: boolean } };

export type ExportOut = { id: string; deck_id: string; deck_version: number; qc: { blocks: number; warns: number }; files: string[]; generated_at: string };

export type Meta = {
  profiles: { id: string; label: string }[];
  sections: { id: string; label: string; templates: string[]; data: string; default_window: string }[];
  scope: { parts: ScopePart[]; items: ScopeSpec[] };
  default_slides: string[];
  template_labels: Record<string, string>;
  channels: Channel[];
  providers: Record<string, boolean>;
  manual_metrics: string[];
  render_backend: string;
};
