"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CroppedImage } from "@/components/crop";
import { MaterialStudio } from "@/components/material-studio";
import { api, type Job, type Material } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Slide } from "./types";

// A material's chapter follows whose material it is (the deck puts a competitor's case in 경쟁사 분석).
const CHAPTER_OF_ROLE: Record<string, string> = { self: "company", competitor: "competitor", benchmark: "competitor", market: "competitor" };

/** A material is on a slide when the slide shows its source, its image or one of its numbers. */
function usedOn(m: Material, s: Slide): boolean {
  const facts = new Set(s.bindings.map((b) => b.fact_id));
  return s.source_ids.includes(m.source.id) || m.assets.some((a) => s.asset_ids.includes(a.id)) || m.facts.some((f) => facts.has(f.id));
}

function Card({ m, onOpen, action }: { m: Material; onOpen: () => void; action?: React.ReactNode }) {
  const asset = m.assets.find((a) => a.id === m.selected_asset_id) ?? m.assets[0];
  return (
    <li className="ed-mat">
      <button type="button" className="ed-mat-main" onClick={onOpen} title="자료 열기">
        <span className="ed-mat-thumb">{asset ? <CroppedImage asset={asset} /> : null}</span>
        <span className="ed-mat-text">
          <strong>{m.event_name || m.title}</strong>
          <span>
            {m.entity ?? ""} · {m.source.publisher ?? "출처"}
          </span>
          {m.review_status === "candidate" && m.review_reason ? <em className="warn">확인 필요: {m.review_reason}</em> : m.summary && <em>{m.summary}</em>}
        </span>
      </button>
      {action}
    </li>
  );
}

/** What this slide is built from, and what else could go on it. Adding happens through adoption + a new draft. */
export function MaterialsPanel({ projectId, slide, slides, stale }: { projectId: string; slide: Slide | null; slides: Slide[]; stale: boolean }) {
  const router = useRouter();
  const { data: materials, reload } = useApi<Material[]>(`/projects/${projectId}/materials`);
  const [open, setOpen] = useState<string | null>(null);
  const [adopted, setAdopted] = useState(0);
  const action = useAction();
  const live = useMemo(() => (materials ?? []).filter((m) => !m.duplicate_of && m.review_status !== "excluded"), [materials]);
  const inDeck = useMemo(() => new Set(live.filter((m) => slides.some((s) => usedOn(m, s))).map((m) => m.id)), [live, slides]);
  if (!slide) return null;
  const used = live.filter((m) => usedOn(m, slide));
  const chapter = slide.chapter ?? "";
  const more = live
    .filter((m) => !inDeck.has(m.id) && m.section_id !== "influencer" && CHAPTER_OF_ROLE[m.role ?? "self"] === chapter)
    .sort((a, b) => Number(b.review_status === "accepted") - Number(a.review_status === "accepted"));

  const adopt = (m: Material) =>
    action.run(async () => {
      await api.patch(`/materials/${m.id}/review`, { status: "accepted" });
      setAdopted((n) => n + 1);
      await reload();
    });
  // A new draft picks the material up; speaker notes carry over by slide id, canvas edits do not.
  const rebuild = () =>
    action.run(async () => {
      const r = await api.post<{ job: Job; deck_id: string }>(`/projects/${projectId}/deck-builds`, {}, { "Idempotency-Key": `editor-${Date.now()}` });
      for (let i = 0; i < 90; i++) {
        const j = await api.get<Job>(`/jobs/${r.job.id}`);
        if (j.state === "succeeded") return router.push(`/editor/${r.deck_id}`);
        if (["failed", "cancelled"].includes(j.state)) throw new Error(j.error_message ?? "초안을 만들지 못했습니다");
        await new Promise((res) => setTimeout(res, 1500));
      }
    });

  return (
    <div className="ed-ai-list ed-mats">
      <section>
        <div className="ed-mats-head">이 장에 쓰인 자료 {used.length}</div>
        {used.length === 0 ? (
          <p className="ed-hint">이 장은 자료 카드 없이 설정·계산 값으로 만들어졌습니다.</p>
        ) : (
          <ul className="ed-mat-list">
            {used.map((m) => (
              <Card key={m.id} m={m} onOpen={() => setOpen(m.id)} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <div className="ed-mats-head">더 넣을 수 있는 자료 {more.length}</div>
        <p className="ed-hint">같은 장({chapter === "company" ? "자사 분석" : chapter === "competitor" ? "경쟁사 분석" : "이 장"})에 맞는, 아직 덱에 없는 자료입니다.</p>
        {more.length > 0 && (
          <ul className="ed-mat-list">
            {more.map((m) => (
              <Card
                key={m.id}
                m={m}
                onOpen={() => setOpen(m.id)}
                action={
                  m.review_status === "accepted" ? (
                    <span className="ed-mat-tag">
                      {m.readiness.length ? `채택됨 · 장표에 들어가려면: ${m.readiness.join(", ")} (눌러서 채우기)` : "채택됨 · 다시 만들면 들어감"}
                    </span>
                  ) : (
                    <button type="button" className="ed-btn sm" disabled={action.busy} onClick={() => adopt(m)}>
                      채택
                    </button>
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
      {(adopted > 0 || stale) && (
        <div className="ed-mats-rebuild">
          <p>
            {adopted > 0 ? `채택한 자료 ${adopted}개는 초안을 다시 만들면 장표에 들어갑니다.` : "초안을 만든 뒤 자료가 바뀌었습니다."} 발표자 메모는 이어지고, 캔버스에서 고친 내용은 새 초안에 이어지지 않습니다.
          </p>
          <button type="button" className="ed-btn primary" disabled={action.busy} onClick={rebuild}>
            {action.busy ? "만드는 중…" : "초안 다시 만들기"}
          </button>
        </div>
      )}
      {action.error && <p className="ed-hint" style={{ color: "#b3192e" }}>{action.error.message}</p>}
      {open && <MaterialStudio id={open} projectId={projectId} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </div>
  );
}
