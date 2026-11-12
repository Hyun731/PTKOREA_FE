"use client";

import Link from "next/link";
import { useState } from "react";
import { ChatThread, type ChatMessage } from "@/components/chat";
import { CauseAction, CauseBadge, RecollectButton } from "@/components/missing-cause";
import { useProject } from "@/components/project-context";
import { ErrorBox, PageIntro } from "@/components/ui";
import { api, type Brand, type BrandDiagnosis, type Outline, type OutlineSlide, type Paragraph, type SynthesisRun, type SynthesisType } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

const SYNTHESIS_TYPES: SynthesisType[] = ["swot", "insight", "problem"];
const SYNTHESIS_TYPE_LABEL: Record<SynthesisType, string> = {
  insight: "분석 요약과 인사이트",
  swot: "경쟁사 대비 SWOT 요약",
  problem: "문제 정의와 솔루션 방향",
};

function SynthesisPanel({ pid, brand, showBrandName, runs, onChanged }: { pid: string; brand: Brand; showBrandName: boolean; runs: SynthesisRun[]; onChanged: () => Promise<void> }) {
  const active = runs.find((r) => r.active) ?? null;
  const history = runs.filter((r) => !r.active).sort((a, b) => b.version - a.version);
  const [selected, setSelected] = useState<SynthesisType[]>(active?.types ?? ["insight"]);
  const [instruction, setInstruction] = useState("");
  const act = useAction();

  const toggle = (t: SynthesisType) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const write = () =>
    act.run(
      async () => {
        const r = await api.post<SynthesisRun>(`/projects/${pid}/synthesis`, { brand_id: brand.id, types: selected, instruction });
        setInstruction("");
        await onChanged();
        return r;
      },
      (r) => (r.dropped.length ? `종합 장표를 썼습니다(v${r.version}) · 규칙에 맞지 않는 ${r.dropped.length}줄은 뺐습니다` : `종합 장표를 썼습니다(v${r.version})`),
    );
  const clear = () =>
    act.run(async () => {
      await api.del(`/projects/${pid}/synthesis?brand_id=${encodeURIComponent(brand.id)}`);
      await onChanged();
    }, "종합 장표를 뺐습니다");
  const activate = (runId: string, version: number) =>
    act.run(async () => {
      await api.post(`/synthesis-runs/${runId}/activate`, {});
      await onChanged();
    }, `v${version}으로 되돌렸습니다`);

  return (
    <div className="draft-summary">
      <div>
        <strong>{showBrandName ? `종합 장표 · ${brand.name}` : "종합 장표"}</strong>
        <div className="small muted mt8">
          {active
            ? `v${active.version} · ${active.types.map((t) => SYNTHESIS_TYPE_LABEL[t]).join(" · ")}`
            : "덱을 만들면 기본 Executive Summary와 인사이트가 자동 생성됩니다. 여기서는 유형과 문구를 바꿔 다시 쓸 수 있습니다."}
        </div>
        {active?.stale && <span className="badge b-warn mt8">본문이 바뀌었습니다, 다시 쓰기를 권합니다</span>}
      </div>

      <div className="synth-types" role="group" aria-label="종합 장표 유형 선택(여러 개를 고르면 고른 순서대로 만듭니다)">
        {SYNTHESIS_TYPES.map((t) => {
          const i = selected.indexOf(t);
          return (
            <button key={t} type="button" className={`chip ${i >= 0 ? "on" : ""}`} aria-pressed={i >= 0} onClick={() => toggle(t)}>
              {selected.length > 1 && i >= 0 && <span className="num">{i + 1}</span>}
              {SYNTHESIS_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      <input aria-label="종합 장표에 바라는 점" placeholder="바라는 점이 있으면 (예: 검색 경쟁을 과제로 앞세워 줘)" value={instruction}
        onChange={(e) => setInstruction(e.target.value)} />

      <div className="actions">
        <button className="btn sm primary" disabled={act.busy || selected.length === 0} onClick={write}>
          {act.busy ? "쓰는 중…" : "다시 쓰기"}
        </button>
        {active && (
          <button className="btn sm ghost" disabled={act.busy} onClick={clear}>
            빼기
          </button>
        )}
      </div>
      <ErrorBox error={act.error} />

      {(active || history.length > 0) && (
        <details className="more">
          <summary>버전 기록 ({runs.length})</summary>
          <ul className="list mt8">
            {[...(active ? [active] : []), ...history].map((r) => (
              <li key={r.id}>
                <div className="grow">
                  <div className="title">
                    v{r.version} {r.active && <span className="badge b-brand">현재</span>}
                  </div>
                  <div className="meta">
                    {r.types.map((t) => SYNTHESIS_TYPE_LABEL[t]).join(" · ")}
                    {r.instruction && ` · "${r.instruction}"`}
                  </div>
                </div>
                {!r.active && (
                  <button className="btn sm" disabled={act.busy} onClick={() => activate(r.id, r.version)}>
                    되돌리기
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const DIAGNOSIS_ORIGIN = { auto: "자동 생성", rewrite: "다시 쓰기", edit: "직접 편집", restore: "버전 복원" } as const;

function Paragraphs({ paragraphs }: { paragraphs: Paragraph[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="diagnosis-line">
          {paragraph.parts.map((part, partIndex) => (
            <span key={partIndex} className={part.type === "fact" || part.color === "accent" ? "diagnosis-accent" : undefined}>
              {part.display ?? part.text ?? ""}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function DiagnosisPanel({ pid, diagnosis, onChanged }: { pid: string; diagnosis: BrandDiagnosis; onChanged: () => Promise<void> }) {
  const [instruction, setInstruction] = useState("");
  const action = useAction();
  const data = diagnosis.data;

  const rewrite = () =>
    action.run(async () => {
      await api.post(`/projects/${pid}/diagnosis`, { brand_id: diagnosis.brand_id, instruction });
      setInstruction("");
      await onChanged();
    }, `${diagnosis.brand_name} 진단을 다시 썼습니다`);
  const toggleClaim = (claimId: string, excluded: boolean) =>
    action.run(async () => {
      await api.patch(`/projects/${pid}/diagnosis/${encodeURIComponent(diagnosis.brand_id)}/claims/${encodeURIComponent(claimId)}`, { excluded });
      await onChanged();
    }, excluded ? "주장을 진단 장표에서 뺐습니다" : "주장을 진단 장표에 다시 넣었습니다");
  const restoreVersion = (version: number) =>
    action.run(async () => {
      await api.post(`/projects/${pid}/diagnosis/${encodeURIComponent(diagnosis.brand_id)}/versions/${version}/activate`, {});
      await onChanged();
    }, `v${version} 진단을 복원했습니다`);

  return (
    <section className="diagnosis-brand" aria-labelledby={`diagnosis-${diagnosis.brand_id}`}>
      <div className="diagnosis-head">
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <h2 id={`diagnosis-${diagnosis.brand_id}`}>{diagnosis.brand_name}</h2>
            {diagnosis.active && <span className="badge b-brand">v{diagnosis.active}</span>}
            {diagnosis.stale && <span className="badge b-warn">자료 변경됨 · 다시 쓰기 권장</span>}
          </div>
          {data?.profile && <p className="diagnosis-profile">{data.profile}</p>}
        </div>
      </div>

      {!data ? (
        <div className="empty-state">
          <strong>아직 생성된 브랜드 진단이 없습니다.</strong>
          <p className="small muted">수치 자료를 채택한 뒤 다시 쓰거나 PPT를 만들면 진단이 생성됩니다.</p>
        </div>
      ) : (
        <>
          <div className="diagnosis-funnel" aria-label={`${diagnosis.brand_name} 구매 퍼널`}>
            {data.funnel.map((stage) => (
              <div key={stage.stage} className={`diagnosis-stage ${stage.status === "강점" ? "good" : stage.status === "이탈" ? "drop" : ""}`}>
                <span className="small muted">{stage.stage}</span>
                <strong>{stage.status}</strong>
                <span>{stage.label || "대표 지표 없음"}</span>
              </div>
            ))}
          </div>

          <div className="diagnosis-claims">
            {data.claims.map((claim) => (
              <article key={claim.id} className={`diagnosis-claim ${claim.excluded ? "excluded" : ""}`}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`badge ${claim.kind === "strength" ? "b-ok" : "b-warn"}`}>{diagnosis.claim_labels[claim.id] ?? (claim.kind === "strength" ? "강점" : "약점")}</span>
                  {claim.edited && <span className="badge b-brand">직접 고침</span>}
                  {claim.excluded && <span className="badge">장표에서 제외</span>}
                  <span className="grow" />
                  <button className="btn sm ghost" disabled={action.busy} onClick={() => toggleClaim(claim.id, !claim.excluded)}>
                    {claim.excluded ? "다시 넣기" : "장표에서 빼기"}
                  </button>
                </div>
                <div className="diagnosis-claim-title"><Paragraphs paragraphs={claim.claim} /></div>
                {claim.evidence.length > 0 && (
                  <div className="diagnosis-evidence">
                    <span className="small muted">근거</span>
                    <Paragraphs paragraphs={claim.evidence} />
                  </div>
                )}
                <div className="small faint">
                  {claim.chart && `차트 ${claim.chart.type} · 근거 수치 ${claim.chart.fact_ids.length}개`}
                  {claim.chart && claim.quote_material_ids.length > 0 && " · "}
                  {claim.quote_material_ids.length > 0 && `원문 ${claim.quote_material_ids.length}건`}
                </div>
              </article>
            ))}
          </div>

          {(data.cdj.length > 0 || data.proposals.length > 0) && (
            <div className="diagnosis-lower">
              {data.cdj.length > 0 && (
                <div className="diagnosis-block">
                  <h3>고객 여정 진단</h3>
                  <div className="diagnosis-cdj">
                    {data.cdj.map((row, index) => (
                      <div key={`${row.stage}-${index}`}>
                        <strong>{row.stage}</strong>
                        <span>{row.touchpoint}</span>
                        <span>{row.state}</span>
                        <span>{row.activity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.proposals.length > 0 && (
                <div className="diagnosis-block">
                  <h3>근거 기반 실행 제안</h3>
                  <div className="diagnosis-proposals">
                    {data.proposals.map((proposal, index) => (
                      <article key={`${proposal.pillar}-${index}`}>
                        <span className="badge b-brand">{proposal.pillar}</span>
                        <strong>{proposal.title}</strong>
                        {proposal.cdj_stage && <span className="small muted">고객 여정 · {proposal.cdj_stage}</span>}
                        <Paragraphs paragraphs={proposal.basis} />
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="diagnosis-rewrite">
        <input aria-label={`${diagnosis.brand_name} 진단 다시 쓰기 요청`} placeholder="다시 쓸 때 강조할 점 (선택)" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        <button className="btn primary" disabled={action.busy} onClick={rewrite}>{action.busy ? "처리 중…" : data ? "진단 다시 쓰기" : "진단 만들기"}</button>
      </div>
      <ErrorBox error={action.error} />

      {diagnosis.dropped.length > 0 && (
        <details className="more">
          <summary>검증에서 제외된 문장 ({diagnosis.dropped.length})</summary>
          <ul className="draft-points mt8">{diagnosis.dropped.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </details>
      )}
      {diagnosis.versions.length > 0 && (
        <details className="more">
          <summary>버전 기록 ({diagnosis.versions.length})</summary>
          <ul className="list mt8">
            {diagnosis.versions.map((version) => (
              <li key={version.version}>
                <div className="grow">
                  <div className="title">v{version.version} · {DIAGNOSIS_ORIGIN[version.origin]} {version.version === diagnosis.active && <span className="badge b-brand">현재</span>}</div>
                  <div className="meta">
                    {version.instruction ? `“${version.instruction}” · ` : ""}{version.by}{version.created_at ? ` · ${new Date(version.created_at).toLocaleString("ko-KR")}` : ""}
                    {version.dropped > 0 && ` · 검증 제외 ${version.dropped}건`}
                  </div>
                </div>
                {version.version !== diagnosis.active && <button className="btn sm" disabled={action.busy} onClick={() => restoreVersion(version.version)}>복원</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// What each calculation rule found, in words (shown under the draft: they feed headlines and Recap).
const RULE_LABEL: Record<string, string> = {
  "RULE-R03": "월별 검색 지수",
  "RULE-R04": "검색 점유 12개월→9개월",
  "RULE-R05": "카테고리 조합어 검색",
  "RULE-R06": "키 타겟 검색 점유",
  "RULE-R10": "광고 추정 후보 조회",
  "RULE-R11": "반응률 상위 크리에이터 규모",
  "RULE-R12": "공동 게시물 반응 저하",
  "RULE-R13": "자체 채널 운영 공백",
};

export default function DraftPage() {
  const { project, plan, brandName, reload: reloadProject } = useProject();
  const pid = project?.id;
  const { data: outline, reload, error } = useApi<Outline>(pid ? `/projects/${pid}/outline` : null);
  const { data: synthesisRuns, reload: reloadSynthesis } = useApi<SynthesisRun[]>(pid ? `/projects/${pid}/synthesis` : null);
  const { data: diagnoses, reload: reloadDiagnoses, error: diagnosisError } = useApi<BrandDiagnosis[]>(pid ? `/projects/${pid}/diagnosis` : null);
  const [view, setView] = useState<"draft" | "diagnosis">("draft");
  // Kept as picked, so the conversation stays visible after its slide is taken out.
  const [picked, setPicked] = useState<{ slide_id: string; title: string; page_no: number | null } | null>(null);
  const selected = picked?.slide_id ?? null;
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const chat = useAction();
  const action = useAction();

  if (!pid) return <p className="muted">불러오는 중…</p>;
  const slides = (outline?.flow ?? []).filter((x): x is OutlineSlide => x.kind === "slide");
  const live = slides.find((s) => s.slide_id === selected) ?? null;
  const current = live ?? picked;
  const messages = (selected && threads[selected]) || [];
  const refresh = async () => {
    await Promise.all([reload(), reloadProject(), reloadSynthesis(), reloadDiagnoses()]);
  };
  const send = (message: string) => {
    if (!live) return;
    const id = live.slide_id;
    const history = (threads[id] ?? []).map(({ role, text }) => ({ role, text }));
    setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), { role: "user", text: message }] }));
    void chat.run(async () => {
      const r = await api.post<{ reply: string; action: string }>(`/projects/${pid}/outline/${encodeURIComponent(id)}/feedback`, { message, history });
      const note = r.action === "rewrite_lead" ? "헤드라인을 고쳤어요" : r.action === "omit" ? "이 장을 뺐어요" : null;
      setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), { role: "ai", text: r.reply, note }] }));
      await refresh();
    });
  };
  const resetLead = (s: OutlineSlide) =>
    action.run(async () => {
      await api.del(`/projects/${pid}/lead-overrides/${encodeURIComponent(s.slide_id)}`);
      await refresh();
    }, "원래 헤드라인으로 돌렸습니다");
  const restore = (slotId: string) =>
    action.run(async () => {
      await api.del(`/projects/${pid}/slot-omissions/${encodeURIComponent(slotId)}`);
      await refresh();
    }, "장표를 다시 넣었습니다");

  return (
    <div className="stack-lg">
      <PageIntro step="4단계" title="초안과 브랜드 진단">
        장표 흐름을 고치고, 수집한 근거로 만든 브랜드별 진단과 실행 제안을 확인합니다.
      </PageIntro>
      <div className="tabs" role="tablist" aria-label="초안과 진단 보기">
        <button type="button" role="tab" aria-selected={view === "draft"} onClick={() => setView("draft")}>초안</button>
        <button type="button" role="tab" aria-selected={view === "diagnosis"} onClick={() => setView("diagnosis")}>
          진단 {diagnoses && <span className="badge b-brand">{diagnoses.filter((item) => item.data).length}/{diagnoses.length}</span>}
        </button>
      </div>
      <ErrorBox error={view === "draft" ? error ?? action.error : diagnosisError} />
      {view === "diagnosis" ? (
        !diagnoses ? (
          <p className="muted">브랜드 진단을 불러오는 중…</p>
        ) : (
          <div className="diagnosis-list">
            {diagnoses.map((diagnosis) => <DiagnosisPanel key={`${diagnosis.brand_id}:${diagnosis.active ?? 0}`} pid={pid} diagnosis={diagnosis} onChanged={refresh} />)}
          </div>
        )
      ) : !outline ? (
        <p className="muted">초안을 만드는 중…</p>
      ) : (
        <div className="draft">
          <aside className="draft-side" aria-label="장표에 의견 주기">
            {current ? (
              <div className="draft-target">
                <span className="small muted num">p.{current.page_no ?? "–"}</span> <strong>{current.title}</strong>
                {!live && <span className="small muted"> · 뺀 장 (아래 ‘뺀 장표’에서 다시 넣기)</span>}
              </div>
            ) : (
              <div className="draft-target muted">오른쪽에서 장표를 누르세요</div>
            )}
            {current ? (
              <ChatThread
                key={current.slide_id}
                messages={messages}
                busy={chat.busy}
                onSend={live ? send : () => undefined}
                placeholder={live ? "이 장을 어떻게 고칠까요?" : "다시 넣으면 이어서 대화할 수 있어요"}
                starters={["헤드라인을 더 짧게", "평가 없이 중립적으로", "경쟁사와의 차이가 드러나게", "이 장은 빼줘"]}
                empty={<p style={{ margin: 0 }}>헤드라인을 다시 쓰거나 이 장을 뺄 수 있어요. 숫자는 장표에 있는 근거로만 씁니다.</p>}
                error={<ErrorBox error={chat.error} />}
              />
            ) : (
              <p className="small muted">장을 고르면 그 장에 대해 대화할 수 있어요.</p>
            )}
          </aside>

          <article className="draft-doc" aria-label="초안 흐름">
            {project?.config.brands.map((b) => {
              const brandRuns = (synthesisRuns ?? []).filter((r) => r.brand_id === b.id);
              return (
                <SynthesisPanel
                  // Remount when the active version changes, so the type chips reflect it again (되돌리기 포함).
                  key={`${b.id}:${brandRuns.find((r) => r.active)?.id ?? "none"}`}
                  pid={pid}
                  brand={b}
                  showBrandName={project.config.brands.length > 1}
                  runs={brandRuns}
                  onChanged={refresh}
                />
              );
            })}
            <p className="small muted num">
              전체 {outline.pages}쪽 · 본문 {slides.length}장{outline.missing.length > 0 && ` · 자료가 없어 빠진 장표 ${outline.missing.length}개`}
            </p>
            {outline.flow.map((x, k) =>
              x.kind === "section" ? (
                <h3 key={`s${k}`} className="draft-section">
                  {x.title}
                  {x.subtitle && <span className="small muted"> · {x.subtitle}</span>}
                </h3>
              ) : (
                <button key={x.slide_id} className={`draft-slide ${x.slide_id === selected ? "on" : ""}`} onClick={() => setPicked({ slide_id: x.slide_id, title: x.title, page_no: x.page_no })} aria-pressed={x.slide_id === selected}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="small muted num">p.{x.page_no ?? "–"}</span>
                    <span className="draft-title">{x.title}</span>
                    {x.continued && <span className="small faint">이어지는 장</span>}
                    {x.edited && <span className="badge b-brand">헤드라인 고침</span>}
                  </div>
                  {x.lead && <div className="draft-lead">{x.lead}</div>}
                  {x.points.length > 0 && (
                    <ul className="draft-points">
                      {x.points.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {x.source && <div className="small faint">{x.source}</div>}
                </button>
              ),
            )}
            {slides.filter((s) => s.edited).length > 0 && (
              <details className="more">
                <summary>고친 헤드라인 되돌리기</summary>
                <ul className="list mt8">
                  {slides.filter((s) => s.edited).map((s) => (
                    <li key={s.slide_id}>
                      <div className="grow">
                        <div className="title">{s.title}</div>
                        <div className="meta">{s.lead}</div>
                      </div>
                      <button className="btn sm" disabled={action.busy} onClick={() => resetLead(s)}>
                        원래 문장으로
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {outline.omitted.length > 0 && (
              <details className="more">
                <summary>뺀 장표 ({outline.omitted.length})</summary>
                <ul className="list mt8">
                  {outline.omitted.map((o) => (
                    <li key={o.slot_id}>
                      <div className="grow">
                        <div className="title">{o.label}</div>
                        <div className="meta">{o.reason}</div>
                      </div>
                      <button className="btn sm" disabled={action.busy} onClick={() => restore(o.slot_id)}>
                        다시 넣기
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {(plan?.findings ?? []).length > 0 && (
              <details className="more">
                <summary>숫자로 찾은 발견 ({plan!.findings.length}) — 헤드라인과 Recap의 근거</summary>
                {plan!.synthetic_data && <p className="small mt8" style={{ color: "var(--warn)" }}>합성 테스트 자료로 계산한 결과입니다. 실제 시장 데이터가 아닙니다.</p>}
                <ul className="list mt8">
                  {plan!.findings.map((f) => (
                    <li key={f.id}>
                      <span className="badge b-brand">{RULE_LABEL[f.rule_id] ?? f.rule_id}</span>
                      <div className="grow">
                        <strong>{brandName(f.brand_id)}</strong> · {f.expression}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {outline.missing.length > 0 && (
              <details className="more">
                <summary>자료가 없어 빠진 장표 ({outline.missing.length})</summary>
                <ul className="list mt8">
                  {outline.missing.map((o) => (
                    <li key={o.slot_id}>
                      <div className="grow">
                        <div className="row wrap" style={{ gap: 8 }}>
                          <span className="title">{o.label}</span>
                          <CauseBadge cause={o.cause} />
                        </div>
                        <div className="meta">{o.action ?? o.reason}</div>
                      </div>
                      <div className="actions">
                        <CauseAction pid={pid} cause={o.cause} action={o.action} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="row wrap mt8" style={{ gap: 8 }}>
                  <RecollectButton pid={pid} itemIds={outline.missing.flatMap((o) => o.item_ids ?? [])} onDone={() => void refresh()} />
                  <span className="small muted">
                    자료를 채택하면 들어갑니다 — <Link href={`/projects/${pid}/materials`}>자료 확인</Link>
                  </span>
                </div>
              </details>
            )}
          </article>
        </div>
      )}
      <div className="sticky-foot">
        <div className="row wrap">
          <span className="grow small muted">초안과 진단이 괜찮으면 PPT를 만드세요. 여기서 제외한 주장과 고친 헤드라인이 그대로 반영됩니다.</span>
          <Link href={`/projects/${pid}/output`} className="btn primary">
            다음 단계: PPT 만들기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
