"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ROLE_LABEL, useProject } from "@/components/project-context";
import { Dialog, ErrorBox, Field, Notice, PageIntro, fmtDateTime } from "@/components/ui";
import { api, type ItemResult, type Job, type ResearchItem, type ResearchPlan, type ScopeEntry, type ScopeSetting } from "@/lib/api";
import { useAction, useApi, useJob } from "@/lib/hooks";

const AUTOMATION: Record<string, [string, string]> = { auto: ["자동 수집", "b-ok"], manual: ["직접 입력", "b-outline"], generated: ["앞 항목으로 생성", "b-brand"] };

// Items made before the 3C scope existed carry only their section.
function legacyScope(i: ResearchItem): string {
  if (i.section_id === "campaign") return i.role === "competitor" ? "3-7" : i.role === "benchmark" ? "3-9" : "2-8";
  return { owned: "2-6", influencer: "2-7", search: "3-2", market: "3-1" }[i.section_id] ?? i.section_id;
}

function settingOf(e: ScopeEntry, enabled: boolean): ScopeSetting {
  const custom = e.period === "custom";
  return { item_id: e.item_id, enabled, period: e.period, months: e.months, start: custom ? e.start : null, end: custom ? e.end : null, channels: e.channels, targets: e.targets, max_items: e.max_items, focus: e.focus ?? null, keywords: e.keywords ?? [] };
}

type Turn = { who: "me" | "ai"; text: string };

/** Ask for a change in words; the AI rewrites the item's period, channels, targets and focus. */
function DirectionChat({ pid, entry, version, onChanged }: { pid: string; entry: ScopeEntry; version: number; onChanged: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const action = useAction();
  const send = () => {
    const message = text.trim();
    if (!message) return;
    void action.run(async () => {
      setTurns((t) => [...t, { who: "me", text: message }]);
      setText("");
      const r = await api.post<{ reply: string }>(`/projects/${pid}/scope/${entry.item_id}/direction`, { base_version: version, message });
      setTurns((t) => [...t, { who: "ai", text: r.reply || "조사 방향을 고쳤습니다." }]);
      await onChanged();
    });
  };
  return (
    <div className="dir-chat">
      {turns.map((t, k) => (
        <div key={k} className={`dir-turn ${t.who}`}>
          {t.text}
        </div>
      ))}
      <ErrorBox error={action.error} />
      <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
        <textarea
          rows={2}
          aria-label="조사 방향 바꾸기 요청"
          value={text}
          placeholder="예: 기간은 최근 1년으로, 팝업·오프라인 행사 위주로 봐줘"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn sm primary" disabled={action.busy || !text.trim()} onClick={send}>
          {action.busy ? "고치는 중…" : "요청"}
        </button>
      </div>
    </div>
  );
}

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
  const action = useAction();
  const [jobId, setJobId] = useState<string | null>(null);
  const [runTotal, setRunTotal] = useState(0);
  const [editing, setEditing] = useState<ResearchItem | null>(null);
  const [chatOpen, setChatOpen] = useState<Record<string, boolean>>({});

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
    await Promise.all([reload(), reloadProject()]);
  });

  const specOf = useMemo(() => Object.fromEntries((meta?.scope.items ?? []).map((sp) => [sp.id, sp])), [meta]);
  const byScope = useMemo(() => {
    const g: Record<string, ResearchItem[]> = {};
    for (const i of plan?.items ?? []) if (i.review_status !== "excluded") (g[i.scope_id ?? legacyScope(i)] ??= []).push(i);
    return g;
  }, [plan]);

  if (!plan || !pid || !project || !meta) return <p className="muted">불러오는 중…</p>;
  const providers = meta.providers ?? {};
  const itemBusy = (i: ResearchItem) => ["queued", "running"].includes(i.execution_status);
  const has = (i: ResearchItem, ...ids: string[]) => i.channels.some((c) => ids.includes(c.id));
  const canAuto = (i: ResearchItem) =>
    Boolean(i.section_id === "campaign" || i.section_id === "market" ? providers.perplexity && has(i, "web") : i.section_id === "influencer" ? providers.scrapecreators && has(i, "instagram", "youtube") : false);
  const urlsOf = (i: ResearchItem) => i.inputs?.post_urls ?? [];
  const tagsOf = (i: ResearchItem) => i.inputs?.hashtags ?? [];
  // An influencer item can run with chosen post URLs, hashtags to discover posts with, or both.
  const hasInput = (i: ResearchItem) => urlsOf(i).length > 0 || tagsOf(i).length > 0;
  const ran = (i: ResearchItem) => ["succeeded", "partial", "needs_review"].includes(i.execution_status);
  const ready = (i: ResearchItem) => i.selected && i.review_status !== "excluded" && canAuto(i) && !ran(i) && !itemBusy(i) && (i.section_id !== "influencer" || hasInput(i));

  const active = plan.items.filter((i) => i.selected && i.review_status !== "excluded");
  const excluded = plan.items.filter((i) => i.review_status === "excluded");
  const toRun = active.filter(ready);
  const busyCount = plan.items.filter(itemBusy).length;
  const waiting = active.filter((i) => i.review_status === "pending" || i.review_status === "stale");
  const step1 = Boolean(plan.confirmed_at);
  const step2 = step1 && toRun.length === 0 && busyCount === 0;
  const step3 = active.length > 0 && waiting.length === 0;
  const current = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : 0;
  const running = Boolean(jobId && job && !["succeeded", "failed", "cancelled"].includes(job.state));

  const refresh = async () => {
    await Promise.all([reload(), reloadProject()]);
  };
  const confirmPlan = async () => {
    if (!plan.confirmed_at) await api.put(`/projects/${pid}/research-plan`, { base_version: plan.version, items: [], confirm: true });
  };
  const run = (ids: string[], force = false) =>
    action.run(async () => {
      await confirmPlan(); // starting a run also okays the plan
      if (ids.length === 0) return refresh();
      setRunTotal(ids.length);
      const r = await api.post<{ job: Job }>(`/projects/${pid}/research-runs`, { item_ids: ids, force });
      setJobId(r.job.id);
      await refresh();
    }, ids.length ? "조사를 시작했습니다. 화면을 닫아도 서버에서 계속됩니다" : "이 방향으로 진행합니다");
  const review = (item: ResearchItem, review_status: string, msg?: string) =>
    action.run(async () => {
      await api.patch(`/research-items/${item.id}/review`, { review_status });
      await refresh();
    }, msg);
  const acceptAll = () =>
    action.run(async () => {
      const r = await api.post<{ accepted: number }>(`/projects/${pid}/research-plan/accept-all`, {});
      await refresh();
      return r;
    }, "남은 항목을 모두 확인 완료로 표시했습니다");
  const toggleScope = (e: ScopeEntry, on: boolean) =>
    action.run(async () => {
      const others = (project.config.scope ?? []).filter((s) => s.item_id !== e.item_id);
      await api.patch(`/projects/${pid}`, { base_version: project.version, changes: { scope: [...others, settingOf(e, on)] } });
      await refresh();
    }, on ? `‘${specOf[e.item_id]?.title}’ 항목을 다시 넣었습니다` : `‘${specOf[e.item_id]?.title}’ 항목을 뺐습니다 · ‘뺀 항목’에서 다시 넣을 수 있습니다`);

  const steps = [
    {
      n: 1,
      title: "조사 방향 확인",
      done: step1,
      body: "항목마다 무엇을, 언제, 어디서 조사할지 적혀 있습니다. 다르면 ‘방향 바꾸기’로 말해 주세요.",
      action: null,
    },
    {
      n: 2,
      title: "자료 모으기",
      done: step2,
      body: toRun.length > 0 ? `자동으로 조사할 대상 ${toRun.length}개` : busyCount > 0 ? "조사 중입니다" : step1 ? "자동 조사를 모두 돌렸습니다" : "방향이 맞으면 조사를 시작하세요",
      action: (
        <button className={`btn sm ${current <= 2 ? "primary" : ""}`} disabled={action.busy || (toRun.length === 0 && step1)} onClick={() => run(toRun.map((i) => i.id))}>
          {toRun.length === 0 && busyCount > 0 ? "조사 중…" : toRun.length > 0 ? `이 방향으로 조사 시작 (${toRun.length})` : "이 방향으로 진행"}
        </button>
      ),
    },
    {
      n: 3,
      title: "결과 확인",
      done: step3,
      body: waiting.length > 0 ? `확인을 기다리는 대상 ${waiting.length}개` : "모두 확인했습니다",
      action: (
        <button className={`btn sm ${current === 3 ? "primary" : ""}`} disabled={action.busy || waiting.length === 0 || busyCount > 0} onClick={acceptAll}>
          모두 확인 완료
        </button>
      ),
    },
  ];

  const itemRow = (i: ResearchItem) => {
    const r = i.last_result ?? {};
    const urls = urlsOf(i);
    const isRunning = itemBusy(i);
    const manual = !canAuto(i) && !["influencer", "search"].includes(i.section_id);
    let next: React.ReactNode = null;
    if (!isRunning) {
      if (i.section_id === "influencer" && !hasInput(i))
        next = (
          <button className="btn sm primary" onClick={() => setEditing(i)}>
            게시물 URL·해시태그 넣기
          </button>
        );
      else if (i.section_id === "search")
        next = (
          <Link className="btn sm" href={`/projects/${pid}/materials`}>
            CSV 올리기
          </Link>
        );
      else if (ready(i))
        next = (
          <button className="btn sm" disabled={action.busy} onClick={() => run([i.id])}>
            자동 조사
          </button>
        );
      else if (manual && i.review_status === "pending")
        next = (
          <Link className="btn sm" href={`/projects/${pid}/materials?item=${i.id}`}>
            자료 직접 작성
          </Link>
        );
      else if (i.review_status === "pending" || i.review_status === "stale")
        next = (
          <button className="btn sm ok" onClick={() => review(i, "accepted", `${i.entity} 확인 완료`)}>
            확인 완료
          </button>
        );
    }
    return (
      <li key={i.id}>
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="title">{i.entity}</span>
            <span className="badge b-outline">{ROLE_LABEL[i.role]}</span>
            {project.config.brands.length > 1 && <span className="small muted">{brandName(i.brand_id)} 보고서</span>}
            {i.review_status === "accepted" && <span className="badge b-ok">확인 완료</span>}
            {isRunning && <span className="badge b-brand">조사 중</span>}
          </div>
          {r.status && (
            <div className="meta">
              {fmtDateTime(r.at)} — {resultLine(r) || "결과 없음"}
              {i.section_id === "influencer" && urls.length > 0 && ` · URL ${urls.length}개`}
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
              {i.section_id === "influencer" && urls.length > 0 && (
                <button className="btn sm ghost" onClick={() => setEditing(i)}>
                  게시물 URL·해시태그 수정
                </button>
              )}
              {i.section_id !== "search" && ran(i) && (
                <button className="btn sm ghost" disabled={action.busy || isRunning || !canAuto(i)} onClick={() => run([i.id], true)}>
                  다시 조사
                </button>
              )}
              {i.review_status === "accepted" && (
                <button className="btn sm ghost" onClick={() => review(i, "pending", "확인 완료를 취소했습니다")}>
                  확인 완료 취소
                </button>
              )}
              <button className="btn sm ghost danger" onClick={() => review(i, "excluded", `${i.entity}을(를) 제외했습니다 · ‘제외된 항목’에서 되돌릴 수 있습니다`)}>
                제외
              </button>
            </div>
          </details>
        </div>
      </li>
    );
  };

  return (
    <div className="stack-lg">
      <PageIntro step="2단계" title="조사 계획">
        팩트북 목차 전체가 자사 → 경쟁사 → 소비자 순서로 들어 있습니다. 필요 없는 항목만 빼고, 방향이 맞으면 조사를 시작하세요.
      </PageIntro>

      <section className="card" aria-labelledby="todo-title">
        <div className="card-head">
          <div className="grow">
            <h3 id="todo-title">이 단계에서 할 일</h3>
            <p>{current === 0 ? "모두 끝났습니다. 다음 단계에서 모인 자료를 확인합니다." : `지금 할 일: ${current}. ${steps[current - 1].title}`}</p>
          </div>
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
              {runTotal > 0 ? `대상 ${Math.min(runTotal, Math.round((job.progress / 100) * runTotal))}/${runTotal}개 처리 완료` : `조사 진행 중 ${job.progress}%`} · 서버에서 진행되므로 다른 화면으로 가도 됩니다
            </p>
          </div>
        )}
        <ErrorBox error={action.error} />
      </section>

      {meta.scope.parts.map((part) => {
        const entries = plan.scope.filter((e) => specOf[e.item_id]?.part === part.id);
        const on = entries.filter((e) => e.enabled);
        const off = entries.filter((e) => !e.enabled);
        return (
          <section key={part.id} className="card" aria-labelledby={`part-${part.id}`}>
            <div className="card-head">
              <span className="scope-no" aria-hidden>
                {part.no}
              </span>
              <div className="grow">
                <h3 id={`part-${part.id}`}>
                  {part.label} <span className="faint small">{part.en}</span>
                </h3>
                <p>{part.question}</p>
              </div>
            </div>
            {on.length === 0 && <p className="small muted">모든 항목을 뺐습니다. 아래 ‘뺀 항목’에서 다시 넣을 수 있습니다.</p>}
            <div className="scope-list">
              {on.map((e) => {
                const spec = specOf[e.item_id];
                const items = byScope[e.item_id] ?? [];
                const [label, cls] = AUTOMATION[e.automation];
                return (
                  <article key={e.item_id} className="scope-item" aria-labelledby={`si-${e.item_id}`}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="scope-id num">{e.item_id}</span>
                      <h4 id={`si-${e.item_id}`} className="grow">
                        {spec.title}
                      </h4>
                      <span className={`badge ${cls}`}>{label}</span>
                    </div>
                    <ul className="direction">
                      {e.direction.map((line, k) => (
                        <li key={k}>{line}</li>
                      ))}
                    </ul>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button className="btn sm ghost" aria-expanded={Boolean(chatOpen[e.item_id])} onClick={() => setChatOpen((m) => ({ ...m, [e.item_id]: !m[e.item_id] }))}>
                        방향 바꾸기
                      </button>
                      <button className="btn sm ghost" disabled={action.busy} onClick={() => toggleScope(e, false)}>
                        이 항목 빼기
                      </button>
                    </div>
                    {chatOpen[e.item_id] && <DirectionChat pid={pid} entry={e} version={project.version} onChanged={refresh} />}
                    {items.length > 0 && <ul className="list scope-targets">{items.map(itemRow)}</ul>}
                  </article>
                );
              })}
            </div>
            {off.length > 0 && (
              <details className="more">
                <summary>뺀 항목 ({off.length})</summary>
                <ul className="list mt8">
                  {off.map((e) => (
                    <li key={e.item_id}>
                      <span className="scope-id num">{e.item_id}</span>
                      <div className="grow">
                        <div className="title">{specOf[e.item_id].title}</div>
                        <div className="meta">{e.direction[0]}</div>
                      </div>
                      <button className="btn sm" disabled={action.busy} onClick={() => toggleScope(e, true)}>
                        다시 넣기
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}

      {excluded.length > 0 && (
        <section className="card" aria-labelledby="excluded-title">
          <details>
            <summary id="excluded-title" className="title">
              제외된 항목 보기 ({excluded.length})
            </summary>
            <ul className="list mt8">
              {excluded.map((i) => (
                <li key={i.id} className="dim">
                  <div className="grow">
                    <div className="title">
                      {specOf[i.scope_id ?? legacyScope(i)]?.title ?? i.question} · {i.entity}
                    </div>
                    <div className="meta">{i.omission_reason}</div>
                  </div>
                  <button className="btn sm" onClick={() => review(i, "pending", "되돌렸습니다")}>
                    되돌리기
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {!providers.perplexity && !providers.scrapecreators && <Notice tone="warn">자동 수집 키가 없어 직접 작성과 CSV로만 진행할 수 있습니다.</Notice>}

      <div className="sticky-foot">
        <div className="row wrap">
          <span className="grow small muted">{step3 ? "조사 결과를 모두 확인했습니다." : "확인이 남아 있어도 다음 단계로 갈 수 있습니다."}</span>
          <Link href={`/projects/${pid}/materials`} className={`btn ${step3 ? "primary" : ""}`}>
            다음 단계: 자료 확인 →
          </Link>
        </div>
      </div>
      {editing && <UrlEditor item={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </div>
  );
}
