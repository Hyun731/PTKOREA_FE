"use client";

import Link from "next/link";
import { useState } from "react";
import { WhereLine } from "@/components/impact";
import { MaterialDrawer } from "@/components/material-drawer";
import { SECTION_LABEL, useProject } from "@/components/project-context";
import { ErrorBox, Kind, Notice, PageIntro, Parts, ReasonButton, Stat, Status } from "@/components/ui";
import { api, fileUrl, type Batch, type Job, type LeadProposal, type Material } from "@/lib/api";
import { useAction, useApi, useJob } from "@/lib/hooks";

const RULE_LABEL: Record<string, string> = {
  "RULE-R03": "월별 검색 지수",
  "RULE-R04": "검색 점유 12개월→9개월",
  "RULE-R05": "카테고리 조합어 검색",
  "RULE-R06": "키 타겟 검색 점유",
  "RULE-R10": "광고 추정 후보 조회",
};

export default function ReviewPage() {
  const { project, plan, brandName, reload: reloadProject } = useProject();
  const pid = project?.id ?? null;
  const { data: batches, reload: reloadBatches } = useApi<Batch[]>(pid ? `/projects/${pid}/imports` : null);
  const { data: materials, reload: reloadMaterials } = useApi<Material[]>(pid ? `/projects/${pid}/materials` : null);
  const [open, setOpen] = useState<string | null>(null);
  const action = useAction();
  if (!pid || !project) return <p className="muted">불러오는 중…</p>;

  const refreshAll = async () => {
    await Promise.all([reloadBatches(), reloadMaterials(), reloadProject()]);
  };
  const run = (fn: () => Promise<unknown>, msg: string) =>
    action.run(async () => {
      await fn();
      await refreshAll();
    }, msg);

  const liveBatches = (batches ?? []).filter((b) => b.status !== "replaced");
  // Extra sources of an already-carded activity are not reviewed on their own.
  const live = (materials ?? []).filter((m) => !m.duplicate_of);
  const pendingBatches = liveBatches.filter((b) => b.status === "candidate");
  const pendingMaterials = live.filter((m) => m.review_status === "candidate");
  // An excluded card's sentences and numbers never reach a slide, so they are not in the queue.
  const reviewable = live.filter((m) => m.review_status !== "excluded");
  const claims = reviewable.flatMap((m) => m.claims.map((c) => ({ ...c, material: m })));
  const staleClaims = claims.filter((c) => c.review_status === "stale");
  const pendingClaims = claims.filter((c) => c.review_status === "pending");
  const pendingFacts = reviewable.flatMap((m) => m.facts.filter((f) => f.verification_status === "candidate").map((f) => ({ ...f, material: m })));
  const total = pendingBatches.length + pendingMaterials.length + pendingClaims.length + staleClaims.length + pendingFacts.length;

  return (
    <div className="stack-lg">
      <PageIntro step="4단계" title="검토·시사점">채택한 자료만 계산과 장표에 쓰입니다.</PageIntro>

      <div className="stats" aria-label="검토 현황">
        <Stat k="검토할 항목" v={total} tone={total ? "warn" : "ok"} />
        <Stat k="CSV 배치 대기" v={pendingBatches.length} tone={pendingBatches.length ? "warn" : undefined} />
        <Stat k="근거 변경 재검토" v={staleClaims.length} tone={staleClaims.length ? "bad" : undefined} />
        <Stat k="채택된 자료" v={project.counts.materials_accepted} tone="ok" />
      </div>
      <ErrorBox error={action.error} />
      {total === 0 && liveBatches.length + (materials?.length ?? 0) > 0 && (
        <Notice tone="ok">
          검토할 항목이 없습니다. <Link href={`/projects/${pid}/output`}>5. 팩트북 출력</Link>에서 초안을 만드세요.
        </Notice>
      )}

      <section className="card" aria-labelledby="q-batch">
        <div className="card-head">
          <div className="grow">
            <h2 id="q-batch">정량 CSV 배치</h2>
            <p>채택한 배치만 계산에 쓰입니다.</p>
          </div>
        </div>
        {liveBatches.length === 0 ? (
          <p className="muted">
            올린 CSV가 없습니다. <Link href={`/projects/${pid}/materials`}>자료 수집</Link>에서 올리세요.
          </p>
        ) : (
          <ul className="list">
            {liveBatches.map((b) => (
              <li key={b.id}>
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="title">{b.filename}</span>
                    <Status value={b.status} />
                    {b.synthetic && <span className="badge b-bad">합성 데이터 · 실제 시장 데이터 아님</span>}
                  </div>
                  <div className="meta num">
                    유효 {b.valid_rows}/{b.total_rows}행 · 중복 정리 {b.duplicates.length} · 오류 {b.errors.length}
                  </div>
                  <WhereLine k={b.kind === "facts" ? "csv.facts" : "csv.posts"} />
                  {b.errors.length > 0 && (
                    <details className="more">
                      <summary>오류 행 {b.errors.length}개 보기</summary>
                      <ul className="small mt8">
                        {b.errors.slice(0, 20).map((e, i) => (
                          <li key={i}>
                            {e.row_no}행 {e.column ? `(${e.column})` : ""}: {e.message}
                          </li>
                        ))}
                      </ul>
                      <a className="small" href={fileUrl(`/imports/${b.id}/errors.csv`)}>
                        오류 목록 CSV 내려받기
                      </a>
                    </details>
                  )}
                </div>
                <div className="actions">
                  {b.status !== "accepted" && (
                    <button className="btn sm primary" onClick={() => run(() => api.post(`/imports/${b.id}/review`, { action: "accept" }), `${b.filename} 배치를 채택했습니다`)}>
                      배치 채택
                    </button>
                  )}
                  {b.status !== "rejected" && <ReasonButton label="제외" title={`${b.filename} 배치 제외`} danger onSubmit={(r) => run(() => api.post(`/imports/${b.id}/review`, { action: "reject", reason: r }), "배치를 제외했습니다").then(() => undefined)} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {staleClaims.length > 0 && (
        <section className="card warn" aria-labelledby="q-stale">
          <div className="card-head">
            <div className="grow">
              <h2 id="q-stale">근거가 바뀌어 다시 볼 문장</h2>
              <p>근거가 바뀌었습니다 — 확인 후 다시 채택하세요.</p>
            </div>
          </div>
          <ul className="list">
            {staleClaims.map((c) => (
              <li key={c.id}>
                <Kind kind={c.kind} />
                <div className="grow">
                  <Parts parts={c.parts} />
                  <div className="meta">
                    {c.material.title} · {c.stale_reason}
                  </div>
                </div>
                <button className="btn sm" onClick={() => setOpen(c.material.id)}>
                  자료 열어 확인
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="q-items">
        <div className="card-head">
          <div className="grow">
            <h2 id="q-items">자료 · 수치 · 문장 검토</h2>
            <p>원문과 대조해 확인하세요.</p>
          </div>
        </div>
        {pendingMaterials.length + pendingClaims.length + pendingFacts.length === 0 ? (
          <p className="muted">검토 대기 항목이 없습니다.</p>
        ) : (
          <ul className="list">
            {pendingFacts.map((f) => (
              <li key={f.id}>
                <span className="badge b-brand">수치</span>
                <div className="grow">
                  <div>
                    {f.label} <strong className="num">{f.display}</strong>
                  </div>
                  <WhereLine k="material.fact" />
                  <div className="meta">
                    {f.material.title} · 측정 {f.measured_at}
                    {f.material.source.url && (
                      <>
                        {" · "}
                        <a href={f.material.source.url} target="_blank" rel="noreferrer">
                          원문 열기 ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <button className="btn sm ok" onClick={() => run(() => api.patch(`/facts/${f.id}/review?project_id=${pid}`, { action: "confirm" }), "원문과 일치함으로 확인했습니다")}>
                    원문과 일치
                  </button>
                  <button className="btn sm" onClick={() => setOpen(f.material.id)}>
                    고치기
                  </button>
                </div>
              </li>
            ))}
            {pendingClaims.map((c) => (
              <li key={c.id}>
                <Kind kind={c.kind} author={c.author} />
                <div className="grow">
                  <Parts parts={c.parts} />
                  <div className="meta">{c.material.title}</div>
                  {c.quote && <div className="meta">원문: “{c.quote.slice(0, 140)}{c.quote.length > 140 ? "…" : ""}”</div>}
                  <WhereLine k={`claim.${c.kind}`} />
                  {c.issues.map((i) => (
                    <div key={i} className="small" style={{ color: "var(--bad)", fontWeight: 600 }}>
                      {i}
                    </div>
                  ))}
                </div>
                <div className="actions">
                  <button className="btn sm ok" disabled={c.issues.length > 0} onClick={() => run(() => api.patch(`/claims/${c.id}`, { base_version: c.version, review_status: "accepted" }), "문장을 채택했습니다")}>
                    채택
                  </button>
                  <button className="btn sm ghost" onClick={() => run(() => api.patch(`/claims/${c.id}`, { base_version: c.version, review_status: "excluded" }), "문장을 제외했습니다")}>
                    제외
                  </button>
                </div>
              </li>
            ))}
            {pendingMaterials.map((m) => (
              <li key={m.id}>
                <span className="badge b-outline">자료</span>
                <div className="grow">
                  <div className="title">{m.title}</div>
                  <div className="meta">
                    {SECTION_LABEL[m.section_id]} · {m.entity ?? brandName(m.brand_id)}
                    {m.readiness.filter((r) => r !== "자료 채택").length > 0 && ` · 남은 일: ${m.readiness.filter((r) => r !== "자료 채택").join(", ")}`}
                  </div>
                </div>
                <button className="btn sm" onClick={() => setOpen(m.id)}>
                  열어서 검토
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LeadProposals pid={pid} onChanged={() => void refreshAll()} />

      <section className="card" aria-labelledby="q-find">
        <div className="card-head">
          <div className="grow">
            <h2 id="q-find">정량 발견 (규칙 계산 결과)</h2>
            <p>계산 규칙으로 찾은 사실입니다.</p>
          </div>
        </div>
        {plan?.synthetic_data && <Notice tone="warn">지금 계산은 합성 테스트 자료를 씁니다. 실제 시장 데이터가 아닙니다.</Notice>}
        {plan && plan.findings.length === 0 ? (
          <p className="muted mt8">채택한 정량 데이터에서 찾은 패턴이 없습니다.</p>
        ) : (
          <ul className="list mt8">
            {(plan?.findings ?? []).map((f) => (
              <li key={f.id}>
                <span className="badge b-brand">{RULE_LABEL[f.rule_id] ?? f.rule_id}</span>
                <div className="grow">
                  <strong>{brandName(f.brand_id)}</strong> · {f.expression}
                </div>
                <span className="small muted num" title="정렬용 강도. 통계적 확률이 아닙니다">
                  우선순위 {Number(f.strength).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(plan?.metric_issues ?? []).map((i, k) => (
          <div key={k} className="mt8">
            <Notice tone="warn">{i.message}</Notice>
          </div>
        ))}
      </section>
      {open && <MaterialDrawer id={open} onClose={() => setOpen(null)} onChanged={() => void refreshAll()} />}
    </div>
  );
}


function LeadProposals({ pid, onChanged }: { pid: string; onChanged: () => void }) {
  const { meta } = useProject();
  const { data: proposals, reload } = useApi<LeadProposal[]>(`/projects/${pid}/insight-proposals`);
  const [jobId, setJobId] = useState<string | null>(null);
  const action = useAction();
  const job = useJob(jobId, async () => {
    setJobId(null);
    await reload();
  });
  const running = Boolean(jobId && job && !["succeeded", "failed", "cancelled"].includes(job.state));
  const pending = (proposals ?? []).filter((p) => p.status === "pending");
  const failed = (proposals ?? []).filter((p) => p.status === "failed");
  const start = () =>
    action.run(async () => {
      const r = await api.post<{ job: Job }>(`/projects/${pid}/insight-proposals`, {});
      setJobId(r.job.id);
    }, "AI 리드 후보를 만들고 있습니다");
  const review = (p: LeadProposal, act: "accept" | "reject") =>
    action.run(async () => {
      await api.post(`/insight-proposals/${p.id}/review`, { action: act });
      await reload();
      onChanged();
    }, act === "accept" ? `${p.slide_title} 리드를 바꿨습니다. 초안을 다시 만들면 반영됩니다` : "후보를 버렸습니다");
  return (
    <section className="card" aria-labelledby="q-lead">
      <div className="card-head">
        <div className="grow">
          <h2 id="q-lead">AI 리드 문장 후보</h2>
          <p>장표에 보이는 수치만 써서 리드를 다듬습니다.</p>
          <p className="where mt4">↳ 각 장표 제목 아래 큰 글씨 리드 문장</p>
        </div>
        <button className="btn" onClick={start} disabled={!meta?.providers.anthropic || running || action.busy}>
          {running ? "만드는 중…" : "AI 리드 후보 만들기"}
        </button>
      </div>
      <ErrorBox error={action.error} />
      {running && job && (
        <div className="progress" role="progressbar" aria-label="리드 후보 진행률" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.max(5, job.progress)}%` }} />
        </div>
      )}
      {!meta?.providers.anthropic && <p className="muted small">Anthropic 키가 없어 사용할 수 없습니다.</p>}
      {pending.length === 0 && !running && meta?.providers.anthropic && <p className="muted small">검토할 후보가 없습니다.</p>}
      <ul className="list">
        {pending.map((p) => (
          <li key={p.id}>
            <span className="badge b-brand">{p.slide_id}</span>
            <div className="grow">
              <div className="title">{p.slide_title}</div>
              <div className="meta">지금: {p.current.map((c) => c.parts.map((x) => x.display ?? x.text ?? "").join("")).join(" ")}</div>
              <div className="mt4" style={{ fontSize: 16 }}>
                <span className="small strong muted">후보 </span>
                <Parts parts={p.parts} />
              </div>
              {p.attempts > 1 && <div className="meta">검사 통과까지 {p.attempts}번 작성</div>}
            </div>
            <div className="actions">
              <button className="btn sm ok" onClick={() => review(p, "accept")}>
                이 문장으로 바꾸기
              </button>
              <button className="btn sm ghost" onClick={() => review(p, "reject")}>
                버리기
              </button>
            </div>
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <details className="more">
          <summary>검사를 통과하지 못해 기존 문장을 유지한 장표 {failed.length}개</summary>
          <ul className="list mt8">
            {failed.map((p) => (
              <li key={p.id}>
                <span className="badge b-outline">{p.slide_id}</span>
                <div className="grow small">
                  {p.slide_title}
                  <div className="faint">{p.errors.slice(0, 2).join(" · ")}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
