"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ROLE_LABEL, SECTION_LABEL, useProject } from "@/components/project-context";
import { Dialog, ErrorBox, Field, Notice, PageIntro, ReasonButton, fmtDate, fmtDateTime } from "@/components/ui";
import { api, type ItemResult, type Job, type ResearchItem, type ResearchPlan, type Usage } from "@/lib/api";
import { useAction, useApi, useJob } from "@/lib/hooks";

// Rough upper bound per item, so the button can say what a run may cost before it starts.
const EST_WEB_ITEM_USD = 0.3;
const EST_PER_POST_USD = 0.004;

function resultLine(r: ItemResult): string {
  const bits: string[] = [];
  if (r.created !== undefined) bits.push(`새 자료 ${r.created}건`);
  if (r.pages) bits.push(`원문 ${r.pages}건 확보`);
  if (r.images) bits.push(`이미지 후보 ${r.images}`);
  if (r.claims) bits.push(`AI 문장 후보 ${r.claims}`);
  if (r.facts) bits.push(`수치 후보 ${r.facts}`);
  if (r.discovered) bits.push(`해시태그 게시물 ${r.discovered.found}건 중 기간 내 크리에이터 ${r.discovered.in_period_creator}건 · ${r.discovered.added}건 추가 (공식 계정 ${r.discovered.official} · 기간 밖 ${r.discovered.out_of_period} 제외)`);
  if (r.posts) bits.push(`게시물 ${r.posts}건 수집`);
  if (r.duplicates) bits.push(`같은 사례 ${r.duplicates}건은 기존 카드에 묶음`);
  if (r.skipped_existing) bits.push(`이미 있는 URL ${r.skipped_existing}건 건너뜀`);
  if (r.out_of_period) bits.push(`조사 기간 밖 ${r.out_of_period}건 제외`);
  if (r.reason) bits.push(r.reason);
  return bits.join(" · ");
}

function UrlEditor({ item, onClose, onSaved }: { item: ResearchItem; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState((item.inputs.post_urls ?? []).join("\n"));
  const [tags, setTags] = useState((item.inputs.hashtags ?? []).map((t) => `#${t}`).join(" "));
  const tagList = tags.split(/[\s,]+/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
  const action = useAction();
  const urls = text.split(/\s+/).map((u) => u.trim()).filter(Boolean);
  return (
    <Dialog
      variant="center"
      title="수집할 게시물"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={action.busy} onClick={() => action.run(async () => { await api.put(`/research-items/${item.id}/inputs`, { post_urls: urls, hashtags: tagList }); onSaved(); onClose(); }, `URL ${urls.length}개${tagList.length ? ` · 해시태그 ${tagList.length}개` : ""}를 저장했습니다`)}>
            저장 (URL {urls.length}{tagList.length ? ` · #${tagList.length}` : ""})
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorBox error={action.error} />
        <Field label="Instagram·YouTube 게시물 URL" help="한 줄에 하나, 최대 40개. 계정 전체가 아니라 브랜드와 관련된 게시물만 골라 넣습니다.">
          {(id, d) => <textarea id={id} aria-describedby={d} data-autofocus rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://www.instagram.com/p/…\nhttps://www.youtube.com/watch?v=…"} />}
        </Field>
        <Field label="Instagram 해시태그로 찾기 (선택)" help="최대 5개. 자동 조사 때 해시태그 게시물을 찾아, 조사 기간 안의 크리에이터 게시물 중 반응이 큰 순으로 최대 20개를 위 목록에 더합니다. 브랜드 공식 계정은 뺍니다.">
          {(id, d) => <input id={id} aria-describedby={d} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#젝시믹스 #xexymix" />}
        </Field>
        <p className="small muted">수집 값은 수집 시점의 공개 관측값입니다. 과거 특정 날짜의 수치를 복원하지 않으며, Instagram 조회는 Instagram 안의 재생만 셉니다.</p>
      </div>
    </Dialog>
  );
}

export default function ResearchPage() {
  const { project, meta, brandName, reload: reloadProject } = useProject();
  const pid = project?.id;
  const { data: plan, reload } = useApi<ResearchPlan>(pid ? `/projects/${pid}/research-plan` : null);
  const { data: usage, reload: reloadUsage } = useApi<Usage>(pid ? `/projects/${pid}/usage` : null);
  const action = useAction();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [runTotal, setRunTotal] = useState(0);
  const [editing, setEditing] = useState<ResearchItem | null>(null);

  // Reconnect to a run still going on the server (browser closed or reloaded).
  useEffect(() => {
    const running = plan?.items.find((i) => ["queued", "running"].includes(i.execution_status) && i.latest_job_id);
    if (running && !jobId) setJobId(running.latest_job_id);
  }, [plan, jobId]);
  // "다른 작업" menus close on an outside click or Escape.
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll("details.menu[open]").forEach((d) => {
        if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.removeAttribute("open");
      });
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  // Several runs may be in flight; keep item states fresh while any item is being researched.
  const anyBusy = (plan?.items ?? []).some((i) => ["queued", "running"].includes(i.execution_status));
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [anyBusy, reload]);
  const job = useJob(jobId, async () => {
    setJobId(null);
    await Promise.all([reload(), reloadUsage(), reloadProject()]);
  });

  const grouped = useMemo(() => {
    const g: Record<string, ResearchItem[]> = {};
    for (const i of plan?.items ?? []) (g[i.section_id] ??= []).push(i);
    return g;
  }, [plan]);

  if (!plan || !pid) return <p className="muted">불러오는 중…</p>;
  const providers = meta?.providers ?? {};
  const selected = (i: ResearchItem) => selection[i.id] ?? i.selected;
  const dirty = Object.keys(selection).length > 0;
  const running = Boolean(jobId && job && !["succeeded", "failed", "cancelled"].includes(job.state));
  // Runs can overlap: only an item that is being researched right now is locked.
  const itemBusy = (i: ResearchItem) => ["queued", "running"].includes(i.execution_status);
  const busyCount = plan.items.filter(itemBusy).length;
  const canAuto = (i: ResearchItem) => Boolean(i.section_id === "campaign" || i.section_id === "market" ? providers.perplexity : i.section_id === "influencer" ? providers.scrapecreators : false);
  const urlsOf = (i: ResearchItem) => i.inputs?.post_urls ?? [];
  const tagsOf = (i: ResearchItem) => i.inputs?.hashtags ?? [];
  // An influencer item can run with chosen post URLs, hashtags to discover posts with, or both.
  const hasInput = (i: ResearchItem) => urlsOf(i).length > 0 || tagsOf(i).length > 0;
  const ran = (i: ResearchItem) => ["succeeded", "partial", "needs_review"].includes(i.execution_status);
  const ready = (i: ResearchItem) => selected(i) && i.review_status !== "excluded" && canAuto(i) && !ran(i) && !itemBusy(i) && (i.section_id !== "influencer" || hasInput(i));

  const active = plan.items.filter((i) => selected(i) && i.review_status !== "excluded");
  const toRun = active.filter(ready);
  const needUrls = active.filter((i) => i.section_id === "influencer" && !hasInput(i));
  const reviewed = plan.items.filter((i) => i.review_status !== "pending").length;
  const estimate = toRun.reduce((s, i) => s + (i.section_id === "influencer" ? (urlsOf(i).length + 20 * Math.min(1, tagsOf(i).length)) * EST_PER_POST_USD + tagsOf(i).length * 60 * 0.0023 : EST_WEB_ITEM_USD), 0);
  const step1 = Boolean(plan.confirmed_at) && !dirty;
  const step2 = step1 && toRun.length === 0 && busyCount === 0;
  const step3 = reviewed === plan.items.length && plan.items.length > 0;
  const current = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : 0;

  const refresh = async () => {
    await Promise.all([reload(), reloadProject()]);
  };
  const saveSelection = async () => {
    await api.put(`/projects/${pid}/research-plan`, { base_version: plan.version, items: Object.entries(selection).map(([id, sel]) => ({ id, selected: sel })), confirm: true });
    setSelection({});
  };
  const confirm = () =>
    action.run(async () => {
      await saveSelection();
      await refresh();
    }, "조사할 항목을 정했습니다. 이제 자료를 모으세요");
  const run = (ids: string[], force = false) =>
    action.run(async () => {
      if (!step1) await saveSelection(); // starting a run also fixes the selection
      setRunTotal(ids.length);
      const r = await api.post<{ job: Job }>(`/projects/${pid}/research-runs`, { item_ids: ids, force });
      setJobId(r.job.id);
      await refresh();
    }, "자동 조사를 시작했습니다. 화면을 닫아도 서버에서 계속됩니다");
  const review = (item: ResearchItem, review_status: string, omission_reason?: string, msg?: string) =>
    action.run(async () => {
      await api.patch(`/research-items/${item.id}/review`, { review_status, omission_reason });
      await refresh();
    }, msg);

  const steps = [
    {
      n: 1,
      title: "조사할 항목 고르기",
      done: step1,
      body: "필요 없는 항목만 체크를 해제하세요.",
      action: (
        <button className={`btn sm ${current === 1 ? "primary" : ""}`} onClick={confirm} disabled={action.busy}>
          {dirty ? "선택 저장" : step1 ? "다시 저장" : "이 항목들로 진행"}
        </button>
      ),
    },
    {
      n: 2,
      title: "자료 모으기",
      done: step2,
      body:
        toRun.length > 0
          ? `자동 조사할 항목 ${toRun.length}개 · 예상 비용 최대 약 $${estimate.toFixed(2)} (이미 받은 응답은 다시 과금하지 않음)`
          : needUrls.length > 0
            ? "인플루언서 항목은 게시물 URL을 먼저 넣어야 합니다."
            : "자동 조사를 모두 돌렸습니다.",
      action: (
        <button className={`btn sm ${current === 2 ? "primary" : ""}`} disabled={action.busy || toRun.length === 0} onClick={() => run(toRun.map((i) => i.id))}>
          {toRun.length === 0 && busyCount > 0 ? "조사 중…" : `자동 조사 시작 (${toRun.length})`}
        </button>
      ),
    },
    {
      n: 3,
      title: "모인 자료 확인하기",
      done: step3,
      body: `결과를 보고 ‘확인 완료’ 또는 ‘제외’를 누르세요 (${reviewed}/${plan.items.length})`,
      action: (
        <Link className={`btn sm ${current === 3 || current === 0 ? "primary" : ""}`} href={`/projects/${pid}/materials`}>
          자료 보러 가기 →
        </Link>
      ),
    },
  ];

  return (
    <div className="stack-lg">
      <PageIntro step="2단계" title="조사 계획">항목별로 자료를 모읍니다. 채택해야 장표에 쓰입니다.</PageIntro>

      <section className="card" aria-labelledby="todo-title">
        <div className="card-head">
          <div className="grow">
            <h3 id="todo-title">이 단계에서 할 일</h3>
            <p>{current === 0 ? "모두 끝났습니다. 다음은 3단계 자료 수집에서 카드별로 채택합니다." : `지금 할 일: ${current}. ${steps[current - 1].title}`}</p>
          </div>
          {usage && (
            <div className="small muted num" style={{ textAlign: "right" }}>
              누적 사용 <strong>${usage.total_cost_usd.toFixed(3)}</strong>
              <br />
              실행 1회 한도 ${usage.budget_per_run_usd.toFixed(0)}
            </div>
          )}
        </div>
        <ol className="todo-steps">
          {steps.map((s) => (
            <li key={s.n} className={s.done ? "done" : current === s.n ? "now" : ""} aria-current={current === s.n ? "step" : undefined}>
              <span className="mark" aria-hidden>
                {s.done ? "✓" : s.n}
              </span>
              <div className="grow">
                <div className="title">
                  {s.title}
                  {s.done && <span className="sr-only"> (완료)</span>}
                </div>
                <div className="meta">{s.body}</div>
              </div>
              {s.action}
            </li>
          ))}
        </ol>
        {running && job && (
          <div className="stack mt16" style={{ gap: 6 }}>
            <div className="progress" role="progressbar" aria-label="자동 조사 진행률" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.max(5, job.progress)}%` }} />
            </div>
            <p className="small muted" role="status">
              {runTotal > 0 ? (
                <>
                  항목 {Math.min(runTotal, Math.round((job.progress / 100) * runTotal))}/{runTotal}개 처리 완료 ({job.progress}%)
                </>
              ) : (
                <>자동 조사 진행 중 {job.progress}%</>
              )}{" "}
              {busyCount > 1 && ` · 동시에 조사 중인 항목 ${busyCount}개`} · 서버에서 진행되므로 다른 화면으로 가도 됩니다
            </p>
          </div>
        )}
        <ErrorBox error={action.error} />
        <p className="small muted mt8">
          연결 상태: 기사·사례 검색 {providers.perplexity ? "✓" : "키 없음"} · 게시물 지표 {providers.scrapecreators ? "✓" : "키 없음"} · AI 후보 추출 {providers.anthropic ? "✓" : "키 없음"}
        </p>
      </section>

      {Object.entries(grouped).map(([section, items]) => (
        <section key={section} className="card" aria-labelledby={`sec-${section}`}>
          <div className="card-head">
            <div className="grow">
              <h3 id={`sec-${section}`}>{SECTION_LABEL[section] ?? section}</h3>
              <p>
                {fmtDate(items[0].period_start)} ~ {fmtDate(items[0].period_end)} · {items.length}개 항목
              </p>
            </div>
          </div>
          <ul className="list">
            {items.map((i) => {
              const inc = selected(i);
              const r = i.last_result ?? {};
              const urls = urlsOf(i);
              const isRunning = ["queued", "running"].includes(i.execution_status);
              // One obvious next action per item; everything else sits under "다른 작업".
              let next: React.ReactNode = null;
              if (inc && i.review_status !== "excluded" && !isRunning) {
                if (section === "influencer" && !hasInput(i))
                  next = (
                    <button className="btn sm primary" onClick={() => setEditing(i)}>
                      게시물 URL·해시태그 넣기
                    </button>
                  );
                else if (section === "search")
                  next = (
                    <Link className="btn sm" href={`/projects/${pid}/materials`}>
                      CSV 올리기
                    </Link>
                  );
                else if (ready(i))
                  next = (
                    <button className="btn sm primary" disabled={action.busy || itemBusy(i)} onClick={() => run([i.id])}>
                      자동 조사
                    </button>
                  );
                else if (i.review_status === "pending")
                  next = (
                    <button className="btn sm ok" onClick={() => review(i, "accepted", undefined, `${i.entity} 항목을 확인 완료로 표시했습니다`)}>
                      확인 완료
                    </button>
                  );
              }
              return (
                <li key={i.id} className={inc && i.review_status !== "excluded" ? "" : "dim"}>
                  <input
                    type="checkbox"
                    style={{ marginTop: 3 }}
                    aria-label={`${i.entity} 이번 조사에 포함`}
                    checked={inc}
                    onChange={(e) => setSelection({ ...selection, [i.id]: e.target.checked })}
                  />
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="title">{i.entity}</span>
                      <span className="badge b-outline">{ROLE_LABEL[i.role]}</span>
                      {i.required && <span className="badge b-neutral">필수</span>}
                    </div>
                    <div className="meta">
                      {i.question} · {brandName(i.brand_id)} 보고서
                      {section === "influencer" && urls.length > 0 && ` · URL ${urls.length}개`}
                    </div>
                    {r.status && (
                      <div className="meta">
                        마지막 실행 {fmtDateTime(r.at)} — {resultLine(r) || "결과 없음"}
                      </div>
                    )}
                    {(r.errors ?? []).map((e, k) => (
                      <div key={k} className="small" style={{ color: e.code === "NOT_IN_STAGE" || e.code === "NEEDS_INPUT" ? "var(--text-2)" : "var(--bad)", fontWeight: 600 }}>
                        {e.message}
                      </div>
                    ))}
                  </div>
                  <div className="actions">
                    {next}
                    <details className="menu">
                      <summary className="btn sm ghost">다른 작업</summary>
                      <div className="menu-pop">
                        <Link className="btn sm ghost" href={`/projects/${pid}/materials?item=${i.id}`}>
                          자료 직접 작성
                        </Link>
                        {section === "influencer" && urls.length > 0 && (
                          <button className="btn sm ghost" onClick={() => setEditing(i)}>
                            게시물 URL·해시태그 수정
                          </button>
                        )}
                        {section !== "search" && ran(i) && (
                          <button className="btn sm ghost" disabled={action.busy || itemBusy(i) || !canAuto(i)} onClick={() => run([i.id], true)} title="이미 받은 응답은 캐시에서 재사용해 다시 과금하지 않습니다">
                            다시 조사
                          </button>
                        )}
                        {i.review_status === "pending" ? (
                          <>
                            {next === null || section === "search" || section === "influencer" ? (
                              <button className="btn sm ghost" onClick={() => review(i, "accepted", undefined, `${i.entity} 항목을 확인 완료로 표시했습니다`)}>
                                확인 완료로 표시
                              </button>
                            ) : null}
                            <ReasonButton label="이 항목 제외" title={`‘${i.entity}’ 항목 제외`} danger onSubmit={(rr) => review(i, "excluded", rr, "항목을 제외했습니다").then(() => undefined)} />
                          </>
                        ) : (
                          <button className="btn sm ghost" onClick={() => review(i, "pending", undefined, "검토 전으로 되돌렸습니다")}>
                            {i.review_status === "excluded" ? "제외 취소" : "확인 완료 취소"}
                          </button>
                        )}
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!providers.perplexity && !providers.scrapecreators && <Notice tone="warn">자동 수집 키가 없어 직접 작성과 CSV로만 진행할 수 있습니다.</Notice>}
      {editing && <UrlEditor item={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </div>
  );
}
