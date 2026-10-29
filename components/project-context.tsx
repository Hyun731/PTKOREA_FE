"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { ApiError, DeckOut, Meta, ProjectOut, SlidePlanOut } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export type StepState = "done" | "attn" | "todo";
export type NextStep = { text: string; href: string; tab: string };

type Ctx = {
  project: ProjectOut | null;
  meta: Meta | null;
  plan: SlidePlanOut | null;
  latestDeck: DeckOut | null;
  error: ApiError | null;
  /** Refresh everything the step bar and next-steps banner depend on. Call after any mutation. */
  reload: () => Promise<void>;
  brandName: (id: string | null | undefined) => string;
  steps: Record<string, { state: StepState; hint: string }>;
  next: NextStep[];
};

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ id, children }: { id: string; children: ReactNode }) {
  const { data: project, error, reload: reloadProject } = useApi<ProjectOut>(`/projects/${id}`);
  const { data: meta } = useApi<Meta>("/meta");
  const { data: plan, reload: reloadPlan } = useApi<SlidePlanOut>(`/projects/${id}/slide-plan`);
  const { data: decks, reload: reloadDecks } = useApi<DeckOut[]>(`/projects/${id}/decks`);
  const latestDeck = decks?.find((d) => d.status === "ready") ?? null;

  const reload = useCallback(async () => {
    await Promise.all([reloadProject(), reloadPlan(), reloadDecks()]);
  }, [reloadProject, reloadPlan, reloadDecks]);

  const brandName = useCallback(
    (bid: string | null | undefined) => project?.config.brands.find((b) => b.id === bid)?.name ?? bid ?? "—",
    [project],
  );

  const { steps, next } = useMemo(() => derive(id, project, plan, latestDeck), [id, project, plan, latestDeck]);

  return (
    <ProjectCtx.Provider value={{ project, meta, plan, latestDeck, error, reload, brandName, steps, next }}>
      {children}
    </ProjectCtx.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error("useProject outside ProjectProvider");
  return ctx;
}

/** Step status + the ordered to-do list shown on every tab. */
function derive(id: string, p: ProjectOut | null, plan: SlidePlanOut | null, deck: DeckOut | null) {
  const steps: Ctx["steps"] = {
    setup: { state: "todo", hint: "" },
    research: { state: "todo", hint: "" },
    materials: { state: "todo", hint: "" },
    review: { state: "todo", hint: "" },
    output: { state: "todo", hint: "" },
  };
  const next: NextStep[] = [];
  if (!p) return { steps, next };
  const c = p.counts;
  const base = `/projects/${id}`;

  steps.setup = { state: "done", hint: `${p.config.brands.length}개 브랜드 · v${p.version}` };

  const items = c.items ?? 0;
  const reviewed = c.items_reviewed ?? 0;
  steps.research = {
    state: c.plan_confirmed ? (reviewed >= items && items > 0 ? "done" : "attn") : "todo",
    hint: c.plan_confirmed ? `항목 ${reviewed}/${items} 확인` : "계획 확정 전",
  };

  steps.materials = {
    state: c.materials + c.batches > 0 ? "done" : "todo",
    hint: `자료 ${c.materials} · CSV ${c.batches}`,
  };

  const pendingReview = c.batches_pending + c.materials_candidate + c.claims_pending + c.facts_pending;
  steps.review = {
    state: pendingReview > 0 ? "attn" : c.materials_accepted + c.batches > 0 ? "done" : "todo",
    hint: pendingReview > 0 ? `검토 대기 ${pendingReview}` : "대기 없음",
  };

  const blocks = plan?.qc.blocks ?? 0;
  steps.output = {
    state: c.exports > 0 && deck && !deck.stale ? "done" : blocks > 0 ? "attn" : "todo",
    hint: c.exports > 0 ? `내보내기 ${c.exports}회` : plan ? `QC 차단 ${blocks}` : "",
  };

  if (!c.plan_confirmed) next.push({ text: "조사 계획을 확인하고 확정하세요", href: `${base}/research`, tab: "조사 계획" });
  if (c.materials + c.batches === 0)
    next.push({ text: "정량 CSV를 올리거나 자료 카드를 추가하세요", href: `${base}/materials`, tab: "자료 수집" });
  if (c.batches_pending) next.push({ text: `CSV 배치 ${c.batches_pending}개를 채택하거나 제외하세요`, href: `${base}/review`, tab: "검토·시사점" });
  if (c.claims_stale) next.push({ text: `근거가 바뀐 문장 ${c.claims_stale}개를 다시 검토하세요`, href: `${base}/review`, tab: "검토·시사점" });
  if (c.facts_pending) next.push({ text: `수치 ${c.facts_pending}개를 원문과 대조하세요`, href: `${base}/review`, tab: "검토·시사점" });
  if (c.materials_candidate) next.push({ text: `자료 ${c.materials_candidate}개의 채택 여부를 정하세요`, href: `${base}/review`, tab: "검토·시사점" });
  const pendingClaims = c.claims_pending - c.claims_stale;
  if (pendingClaims > 0) next.push({ text: `근거 문장 ${pendingClaims}개를 검토하세요`, href: `${base}/review`, tab: "검토·시사점" });
  if (plan) {
    const otherBlocks = plan.qc.issues.filter((i) => i.severity === "block" && i.code !== "SLOT_NEEDS_INPUT").length;
    if (otherBlocks) next.push({ text: `출력 전 검수 차단 ${otherBlocks}건을 해결하세요`, href: `${base}/output`, tab: "팩트북 출력" });
    if (!blocks && c.materials + c.batches > 0) {
      if (!deck) next.push({ text: "초안을 생성해 미리보기를 확인하세요", href: `${base}/output`, tab: "팩트북 출력" });
      else if (deck.stale) next.push({ text: "자료가 바뀌었습니다 — 초안을 다시 생성하세요", href: `${base}/output`, tab: "팩트북 출력" });
      else if (!c.exports) next.push({ text: "PPTX와 원장을 내보내세요", href: `${base}/output`, tab: "팩트북 출력" });
    }
  }
  return { steps, next };
}

// Five-step flow from the client MVP (PRD 4); shown both on the project sidebar
// and as the home-page roadmap, so first-time users see the whole journey up front.
export const STEPS: { slug: string; label: string; desc: string }[] = [
  { slug: "setup", label: "프로젝트 설정", desc: "브랜드·경쟁사·기간" },
  { slug: "research", label: "조사 계획", desc: "모을 자료 항목 정하기" },
  { slug: "materials", label: "자료 수집", desc: "CSV·카드로 근거 모으기" },
  { slug: "review", label: "검토·시사점", desc: "사람이 채택·수정" },
  { slug: "output", label: "팩트북 출력", desc: "PPTX·원장 내보내기" },
];

export const SECTION_LABEL: Record<string, string> = {
  search: "검색 경쟁",
  influencer: "인플루언서",
  campaign: "캠페인 사례",
  market: "시장·타겟",
  recap: "Recap",
  appendix: "출처 표",
};

export const ROLE_LABEL: Record<string, string> = { self: "자사", competitor: "경쟁사", benchmark: "벤치마크", market: "시장" };
