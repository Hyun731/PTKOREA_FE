"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { useProject } from "@/components/project-context";
import { Notice, PageIntro, Status } from "@/components/ui";
import { fileUrl, type Binding, type DeckOut } from "@/lib/api";
import { useApi } from "@/lib/hooks";

const UNIT_LABEL: Record<string, string> = { percent: "비율", pp: "차이(pp)", count: "건수·횟수", index: "지수", rank: "순위", months: "개월 수", flag: "분류" };

function blockLabel(blockId: string) {
  const b = blockId.split("[")[0];
  if (b === "lead") return "리드 문장";
  if (b === "takeaway") return "하단 요약";
  if (b === "footnote") return "각주";
  if (b.endsWith("_chart")) return "차트";
  if (b.endsWith("_caption")) return "차트 설명";
  if (b === "table") return "표";
  if (b.startsWith("card")) return `사례 카드 ${Number(b.match(/card(\d+)/)?.[1] ?? 0) + 1}`;
  if (b.startsWith("pillar")) return `요약 기둥 ${Number(b.match(/pillar(\d+)/)?.[1] ?? 0) + 1}`;
  return "본문";
}

function StudioInner() {
  const { project } = useProject();
  const pid = project?.id ?? null;
  const params = useSearchParams();
  const router = useRouter();
  const { data: decks } = useApi<DeckOut[]>(pid ? `/projects/${pid}/decks` : null);
  const ready = decks?.find((d) => d.status === "ready") ?? null;
  const { data: deck } = useApi<DeckOut>(ready ? `/decks/${ready.id}` : null);
  const slides = deck?.spec?.slides ?? [];
  const idx = Math.min(Math.max(0, Number(params.get("page") ?? 1) - 1), Math.max(0, slides.length - 1));
  const go = (i: number) => router.replace(`/projects/${pid}/studio?page=${i + 1}`, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "ArrowRight" && idx < slides.length - 1) go(idx + 1);
      if (e.key === "ArrowLeft" && idx > 0) go(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const grouped = useMemo(() => {
    const slide = slides[idx];
    if (!slide) return [];
    const g = new Map<string, Binding[]>();
    const seen = new Set<string>();
    for (const b of slide.bindings) {
      const label = blockLabel(b.block_id);
      const key = `${label}:${b.fact_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!g.has(label)) g.set(label, []);
      g.get(label)!.push(b);
    }
    return [...g.entries()];
  }, [slides, idx]);

  if (!pid || !decks) return <p className="muted">불러오는 중…</p>;
  if (!deck?.spec)
    return (
      <div className="empty">
        <strong>아직 만든 초안이 없습니다</strong>
        <Link href={`/projects/${pid}/output`}>5. 팩트북 출력</Link>에서 초안을 만드세요.
      </div>
    );
  const slide = slides[idx];
  const issues = (deck.qc?.issues ?? []).filter((i) => i.slide_id === slide.slide_id);
  const rendered = deck.render_status === "ok";

  return (
    <div className="stack">
      <PageIntro step="근거 확인" title="장표 스튜디오">
        장표에 표시된 숫자가 어떤 근거에서 왔는지 페이지별로 확인합니다. 문장·수치 수정은 자료 수집·검토 화면에서 하고, 페이지 단위 수정 기능은 다음 단계에서 추가됩니다.
      </PageIntro>
      <div className="row wrap">
        <strong>초안 v{deck.version}</strong>
        {deck.stale ? <span className="badge b-bad">! 이후 자료가 바뀜</span> : <span className="badge b-ok">✓ 현재 자료와 일치</span>}
        <span className="grow" />
        <button className="btn sm" onClick={() => go(idx - 1)} disabled={idx === 0}>
          ← 이전
        </button>
        <span className="num" aria-live="polite">
          {idx + 1} / {slides.length}
        </span>
        <button className="btn sm" onClick={() => go(idx + 1)} disabled={idx >= slides.length - 1}>
          다음 →
        </button>
      </div>
      <div className="studio">
        <nav className="pages" aria-label="페이지 목록">
          {slides.map((s, i) => (
            <button key={s.slide_id} aria-current={i === idx ? "true" : undefined} onClick={() => go(i)}>
              {rendered && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(`/decks/${deck.id}/preview/${i + 1}`)} alt="" loading="lazy" />
              )}
              <div className="cap">
                <span className="faint num">{i + 1}.</span> {s.title}
              </div>
            </button>
          ))}
        </nav>
        <div className="canvas">
          {rendered ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(`/decks/${deck.id}/preview/${idx + 1}`)} alt={`${idx + 1}쪽: ${slide.title}`} />
          ) : (
            <Notice tone="warn">실제 렌더 미리보기가 없습니다. {deck.render_message}</Notice>
          )}
        </div>
        <aside className="side" aria-label="이 페이지의 근거">
          <section className="card">
            <h2 style={{ fontSize: 17 }}>{slide.title}</h2>
            {slide.needs_review && (
              <div className="mt8">
                <Notice tone="warn">계산 발견이 없어 중립 리드 문장으로 만들었습니다. 문장을 확인하세요.</Notice>
              </div>
            )}
          </section>
          <section className="card">
            <h3>검수 결과</h3>
            {issues.length === 0 ? (
              <p className="small muted mt8">이 페이지에는 차단·경고가 없습니다.</p>
            ) : (
              <ul className="list mt8">
                {issues.map((i, k) => (
                  <li key={k}>
                    <Status value={i.severity} />
                    <div className="grow small">
                      {i.message}
                      <div className="faint">{i.action}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h3>표시된 숫자와 근거</h3>
            {grouped.length === 0 && <p className="small muted mt8">이 페이지에는 숫자가 없습니다.</p>}
            {grouped.map(([label, items]) => (
              <div key={label} className="mt12">
                <div className="small strong muted">{label}</div>
                <ul className="list">
                  {items.map((b) => (
                    <li key={b.fact_id} style={{ padding: "8px 0" }}>
                      <strong className="num" style={{ minWidth: 72 }}>
                        {b.display}
                      </strong>
                      <div className="grow small">
                        {b.entity ?? ""} · {UNIT_LABEL[b.unit] ?? b.unit}
                        <div className="faint mono" style={{ fontSize: 12 }}>
                          {b.fact_id}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          {slide.notes && (
            <details className="card">
              <summary className="strong" style={{ cursor: "pointer" }}>
                발표자 노트 (근거 ID 포함)
              </summary>
              <pre className="small mt8" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "8px 0 0" }}>
                {slide.notes}
              </pre>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<p className="muted">불러오는 중…</p>}>
      <StudioInner />
    </Suspense>
  );
}
