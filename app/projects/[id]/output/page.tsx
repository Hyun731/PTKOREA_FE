"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SECTION_LABEL, useProject } from "@/components/project-context";
import { CauseAction, CauseBadge, RecollectButton } from "@/components/missing-cause";
import { SlideMap } from "@/components/slide-map";
import type { SlideKind } from "@/lib/impact";
import { Checklist, ErrorBox, Notice, PageIntro, ReasonButton, Stat, Status, fmtDateTime } from "@/components/ui";
import { api, ApiError, fileUrl, type DeckOut, type DraftEditOut, type ExportOut, type Job, type QCIssue, type QuickAiEditOut, type SlideSpec } from "@/lib/api";
import { useAction, useApi, useJob } from "@/lib/hooks";

const TEMPLATE_KIND: Record<string, SlideKind> = { "2-8a": "share", "2-8b": "trend", "2-8c": "combo", "2-8d": "target", "3-1": "creator", C1: "case", C2: "case", M1: "market", "5-recap": "recap", "A-source": "source" };

const FILE_LABEL: Record<string, [string, string]> = {
  "report.pptx": ["보고서 PPTX", "고객용 편집 가능 파일"],
  "factbook.csv": ["수치 원장", "모든 원본·파생 수치와 계산 경로"],
  "sources.csv": ["출처 원장", "사용한 자료와 링크"],
  "assets.csv": ["이미지 원장", "이미지·자른 영역·사용 근거"],
  "findings.json": ["발견 목록", "규칙 계산 결과"],
  "deck_spec.json": ["장표 명세", "재현·검토용 구조"],
  "build_report.json": ["빌드 리포트", "검수·생략·경고 기록"],
  "errors.csv": ["입력 오류 행", "CSV에서 거부된 행"],
};

/** Where to fix a block, in the user's words. */
function fixLink(pid: string, i: QCIssue): { href: string; label: string } | null {
  const base = `/projects/${pid}`;
  if (i.code === "SLOT_NEEDS_INPUT") return { href: `${base}/materials`, label: "자료 수집에서 채우기" };
  if (["FOOTNOTE_MISSING", "IMAGE_MISSING", "IMAGE_NOT_ACCEPTED", "BAD_CROP"].includes(i.code)) return { href: `${base}/materials`, label: "자료 수집에서 고치기" };
  if (["UNBOUND_NUMBER", "FACT_NOT_ELIGIBLE", "SOURCE_CONFLICT", "FACT_UNLINKED"].includes(i.code)) return { href: `${base}/materials`, label: "자료 확인에서 고치기" };
  return null;
}

export default function OutputPage() {
  const { project, plan, reload } = useProject();
  const pid = project?.id ?? null;
  const { data: decks, reload: reloadDecks } = useApi<DeckOut[]>(pid ? `/projects/${pid}/decks` : null);
  const { data: exports, reload: reloadExports } = useApi<ExportOut[]>(pid ? `/projects/${pid}/exports` : null);
  const latest = decks?.[0] ?? null;
  const shown = decks?.find((d) => d.status === "ready") ?? null; // last good version stays visible while building
  const { data: deck, reload: reloadDeck } = useApi<DeckOut>(shown ? `/decks/${shown.id}` : null);
  const { data: edit, reload: reloadEdit } = useApi<DraftEditOut>(shown ? `/decks/${shown.id}/edit` : null);
  const [buildJob, setBuildJob] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<string | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [rewriting, setRewriting] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    if (latest?.status === "building" && latest.job_id) setBuildJob(latest.job_id); // reconnect after reload
  }, [latest?.status, latest?.job_id]);
  useEffect(() => {
    if (shown) void reloadDeck();
  }, [shown?.id, reloadDeck]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (edit) setIncluded(new Set(edit.slides.map((slide) => slide.slide_id)));
  }, [edit?.edit_version, edit?.deck_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const build = useJob(buildJob, async () => {
    await Promise.all([reloadDecks(), reload()]);
  });
  const exp = useJob(exportJob, async () => {
    await Promise.all([reloadExports(), reload()]);
  });

  if (!pid || !plan) return <p className="muted">불러오는 중…</p>;

  const refresh = async () => {
    await Promise.all([reload(), reloadDecks()]);
  };
  const startBuild = (confirmPending = false) =>
    action.run(async () => {
      const r = await api.post<{ job: Job }>(`/projects/${pid}/deck-builds`, confirmPending ? { confirm_pending: true } : undefined,
        { "Idempotency-Key": `build-${pid}-${Date.now()}` });
      setBuildJob(r.job.id);
      await reloadDecks();
    }, "초안 생성을 시작했습니다. 화면을 닫아도 계속 진행됩니다");
  const startExport = () =>
    action.run(async () => {
      if (!deck) return;
      if (edit?.edited) {
        await api.post<ExportOut>(`/decks/${deck.id}/edit/export`);
        await reloadExports();
        return;
      }
      const r = await api.post<{ job: Job }>(`/decks/${deck.id}/exports`, undefined, { "Idempotency-Key": `export-${deck.id}` });
      setExportJob(r.job.id);
    }, edit?.edited ? "선택한 장표로 편집 초안을 내보냈습니다" : "내보내기를 시작했습니다");

  const reviews = plan.qc.issues.filter((i) => i.code !== "SLOT_OMITTED");
  const building = Boolean(build && !["succeeded", "failed", "cancelled"].includes(build.state));
  const ready = { fresh: Boolean(deck && !deck.stale), render: deck?.render_status === "ok", export: (deck?.qc?.export_blocks ?? 0) === 0 };
  const canExport = Boolean(deck && edit && deck.status === "ready" && ready.export && ready.fresh && ready.render);
  const originalSlides = deck?.spec?.slides ?? [];
  const currentIds = new Set((edit?.slides ?? []).map((slide) => slide.slide_id));
  const selectionDirty = originalSlides.length > 0 && originalSlides.some((slide) => included.has(slide.slide_id) !== currentIds.has(slide.slide_id));
  const saveSelection = () =>
    action.run(async () => {
      if (!deck || !edit || included.size === 0) return;
      const editedById = new Map(edit.slides.map((slide) => [slide.slide_id, slide]));
      const slides = originalSlides
        .filter((slide) => included.has(slide.slide_id))
        .map((slide) => editedById.get(slide.slide_id) ?? slide);
      await api.put(`/decks/${deck.id}/edit`, { base_version: edit.edit_version, slides, title: edit.title });
      await reloadEdit();
    }, `${included.size}장으로 초안을 정리했습니다`);
  const rewriteSlide = async (slide: SlideSpec, kind: "headline" | "body") => {
    if (!deck || !edit || selectionDirty || !included.has(slide.slide_id)) return;
    const editableSlide = edit.slides.find((current) => current.slide_id === slide.slide_id);
    if (!editableSlide) return;
    const roles = kind === "headline"
      ? new Set(["lead", "cover_title", "divider_title"])
      : new Set(["body", "insight", "takeaway", "caption"]);
    const elementIds = editableSlide.blocks.filter((block) => block.role && roles.has(block.role)).map((block) => block.block_id);
    if (elementIds.length === 0) {
      action.setError(new ApiError(422, "NO_EDITABLE_TEXT", kind === "headline" ? "다시 쓸 제목이 없습니다" : "다듬을 본문이 없습니다"));
      return;
    }
    const key = `${slide.slide_id}:${kind}`;
    setRewriting(key);
    await action.run(async () => {
      const instruction = kind === "headline"
        ? "선택한 헤드라인을 현재 장표의 근거 범위 안에서 더 명확하고 결론 중심인 한 문장으로 다시 써줘"
        : "선택한 본문을 현재 의미와 근거는 유지하면서 더 짧고 읽기 쉽게 다듬어줘";
      const out = await api.post<QuickAiEditOut>(`/decks/${deck.id}/edit/ai`, {
        message: instruction,
        slides: edit.slides,
        current_slide_id: slide.slide_id,
        scope: "selection",
        selection: { element_ids: { [slide.slide_id]: elementIds }, areas: [] },
        history: [],
      });
      if (!out.applied.length) return false;
      const changedById = new Map(out.slides.map((changed) => [changed.slide_id, changed]));
      const merged = edit.slides.map((current) => changedById.get(current.slide_id) ?? current);
      await api.post(`/decks/${deck.id}/edit/log/${out.log_id}/apply`, {
        base_version: edit.edit_version,
        slides_before: edit.slides,
        slides: merged,
        title: edit.title,
      });
      await reloadEdit();
      return true;
    }, (changed) => changed
      ? (kind === "headline" ? "헤드라인을 다시 썼습니다" : "본문을 다듬었습니다")
      : (kind === "headline" ? "이미 한 문장으로 정리된 제목입니다" : "이미 충분히 간결한 본문입니다"));
    setRewriting(null);
  };

  return (
    <div className="stack-lg">
      <PageIntro step="5단계" title="초안 만들기">가능한 자료로 초안을 먼저 만들고, 필요한 부분만 빠르게 확인합니다.</PageIntro>
      <div className="stats" aria-label="장표 현황">
        <Stat k="계획한 장표" v={plan.counts.planned} />
        <Stat k="만들 수 있는 장표" v={plan.counts.generated} tone="ok" />
        <Stat k="자료가 없어 빠진 장표" v={plan.counts.needs_input} />
        <Stat k="출력 페이지 수" v={plan.counts.pages} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <RecollectButton pid={pid} itemIds={plan.plan.flatMap((s) => (s.readiness === "needs_input" ? s.item_ids ?? [] : []))} onDone={() => void reload()} />
      </div>
      <ErrorBox error={action.error?.code === "PENDING_REVIEW" ? null : action.error} />
      {action.error?.code === "PENDING_REVIEW" && (
        <Notice tone="warn">
          확인 대기 {(action.error.detail as { pending: number }).pending}건이 있습니다. 그래도 만들까요?
          <div className="row wrap mt8" style={{ gap: 8 }}>
            <Link href={`/projects/${pid}/materials`} className="btn sm">
              확인하러 가기
            </Link>
            <button className="btn sm primary" disabled={action.busy} onClick={() => startBuild(true)}>
              그대로 만들기
            </button>
          </div>
        </Notice>
      )}

      {/* Step A */}
      <section className="card" aria-labelledby="s-a">
        <div className="card-head">
          <div className="grow">
            <h2 id="s-a">① 초안 준비 상태</h2>
            <p>확인 항목이 있어도 초안 생성과 내보내기는 계속할 수 있습니다.</p>
          </div>
          {reviews.length === 0 ? <span className="badge b-ok">✓ 바로 사용 가능</span> : <span className="badge b-warn">! 확인 권장 {reviews.length}건</span>}
        </div>
        {(plan.qc.actions ?? []).length > 0 && (
          <div className="stats mt8" aria-label="확인 권장 항목">
            {(plan.qc.actions ?? []).map((item) => <Stat key={item.key} k={item.label} v={item.slides || item.count} tone="warn" />)}
          </div>
        )}
        {reviews.length > 0 && (
          <details className="more">
            <summary>세부 확인 항목 {reviews.length}건</summary>
            <ul className="list mt8">
              {reviews.map((i, k) => {
                const fix = fixLink(pid, i);
                return (
                  <li key={k}>
                    <Status value="warn" />
                    <div className="grow">
                      <div>{i.message}</div>
                      <div className="meta">{i.slide_id ? `${i.slide_id} 장표 · ` : ""}{i.action}</div>
                    </div>
                    {fix && <a className="btn sm" href={fix.href}>{fix.label}</a>}
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        <h3 id="plan" className="mt24" style={{ scrollMarginTop: 16 }}>
          장표 계획
        </h3>
        <p className="small muted mt4">자료가 없는 장표는 자료를 보충하거나, 사유를 남겨 이번 보고서에서 뺍니다. 빈 장표는 고객용 출력에 넣지 않습니다.</p>
        <table className="table mt8">
          <caption className="sr-only">장표 계획과 준비 상태</caption>
          <thead>
            <tr>
              <th scope="col">장표</th>
              <th scope="col">상태</th>
              <th scope="col">설명</th>
              <th scope="col">
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.plan.map((s) => (
              <tr key={s.slot_id}>
                <th scope="row" style={{ color: "var(--text)", fontWeight: 600 }}>
                  <div className="row" style={{ gap: 12 }}>
                    <div className="slot-map" aria-hidden>
                      <SlideMap kind={TEMPLATE_KIND[s.template_id] ?? "none"} regions={[]} label="" />
                    </div>
                    <div>
                      {s.label}
                      <div className="small faint">{SECTION_LABEL[s.section_id] ?? s.section_id}</div>
                    </div>
                  </div>
                </th>
                <td>
                  {s.readiness === "needs_input" && s.cause ? <CauseBadge cause={s.cause} /> : <Status value={s.readiness} />}
                </td>
                <td className="small">{s.readiness === "ready" ? `${s.slide_ids.length}장 생성` : (s.action ?? s.reason)}</td>
                <td style={{ textAlign: "right" }}>
                  {s.readiness === "needs_input" && <CauseAction pid={pid} cause={s.cause ?? null} action={s.action ?? null} />}
                  {s.readiness === "omitted" && (
                    <button className="btn sm ghost" onClick={() => action.run(async () => { await api.del(`/projects/${pid}/slot-omissions/${encodeURIComponent(s.slot_id)}`); await refresh(); }, "생략을 취소했습니다")}>
                      생략 취소
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Step B */}
      <section className="card" aria-labelledby="s-b">
        <div className="card-head">
          <div className="grow">
            <h2 id="s-b">② 초안 생성 · 미리보기</h2>
            <p>실제 PPTX를 렌더한 미리보기입니다.</p>
          </div>
          <button className="btn primary" onClick={() => startBuild()} disabled={action.busy || building}>
            {building ? "만드는 중…" : shown ? "초안 다시 만들기" : "초안 만들기"}
          </button>
        </div>
        {build && building && (
          <div className="stack" style={{ gap: 6, marginBottom: 16 }}>
            <div className="progress" role="progressbar" aria-label="초안 생성 진행률" aria-valuenow={build.progress} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${build.progress}%` }} />
            </div>
            <p className="small muted" role="status">
              {build.progress}% · 서버에서 진행 중이라 이 화면을 닫아도 계속됩니다
            </p>
          </div>
        )}
        {build?.state === "failed" && <Notice tone="error">초안을 만들지 못했습니다: {build.error_message}</Notice>}
        {!deck && !building && <div className="empty">아직 만든 초안이 없습니다.</div>}
        {deck && deck.status === "ready" && (
          <>
            <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
              <strong>초안 v{deck.version}</strong>
              <span className="small muted">{fmtDateTime(deck.created_at)}</span>
              <Status value={deck.draft_status ?? "ready"} />
              <Status value={deck.render_status} />
              {deck.stale ? <span className="badge b-bad">! 이후 자료가 바뀜 — 다시 만들기 필요</span> : <span className="badge b-ok">✓ 현재 자료와 일치</span>}
              <span className="grow" />
              <Link href={`/projects/${pid}/studio`} className="btn sm">
                스튜디오에서 근거 보기
              </Link>
              {deck.status === "ready" && (
                <Link href={`/editor/${deck.id}`} className="btn sm primary">
                  편집기에서 열기
                </Link>
              )}
            </div>
            {edit && originalSlides.length > 0 && (
              <div className="sub row wrap" style={{ gap: 8, marginBottom: 14 }}>
                <div className="grow">
                  <strong>사용할 장표 선택</strong>
                  <div className="small muted">{included.size} / {originalSlides.length}장 · 필요 없는 장표를 끄고 한 번에 저장하세요.</div>
                </div>
                <button className="btn sm" onClick={() => setIncluded(new Set(originalSlides.map((slide) => slide.slide_id)))} disabled={included.size === originalSlides.length}>
                  모두 선택
                </button>
                <button className="btn sm" onClick={() => setIncluded(new Set(edit.slides.map((slide) => slide.slide_id)))} disabled={!selectionDirty}>
                  선택 되돌리기
                </button>
                <button className="btn sm primary" onClick={saveSelection} disabled={!selectionDirty || included.size === 0 || action.busy}>
                  선택 저장
                </button>
              </div>
            )}
            {deck.render_status !== "ok" && <Notice tone="warn">{deck.render_message ?? "실제 렌더 미리보기를 만들지 못했습니다."}</Notice>}
            <ul className="slides" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(deck.spec?.slides ?? []).map((s, i) => (
                <li key={s.slide_id} style={{ opacity: !edit || included.has(s.slide_id) ? 1 : 0.48 }}>
                  <Link href={`/projects/${pid}/studio?page=${i + 1}`} className="slide-thumb" aria-label={`${i + 1}쪽 ${s.title} 스튜디오에서 보기`}>
                    {deck.render_status === "ok" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(`/decks/${deck.id}/preview/${i + 1}`)} alt="" loading="lazy" />
                    ) : (
                      <div className="empty" style={{ aspectRatio: "16/9", borderRadius: 0 }}>
                        {s.title}
                      </div>
                    )}
                    <div className="cap">
                      <span className="faint num">{i + 1}</span>
                      <span className="grow">{s.title}</span>
                      {s.needs_review && <span className="badge b-warn">리드 확인</span>}
                    </div>
                  </Link>
                  {edit && (
                    <div className="stack" style={{ gap: 5, padding: "6px 2px" }}>
                      <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={included.has(s.slide_id)}
                          onChange={(event) => setIncluded((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(s.slide_id);
                            else if (next.size > 1) next.delete(s.slide_id);
                            return next;
                          })}
                        />
                        초안에 포함
                      </label>
                      <div className="row wrap" style={{ gap: 5 }}>
                        <button className="btn sm" title={selectionDirty ? "장표 선택을 먼저 저장하세요" : undefined} disabled={selectionDirty || !included.has(s.slide_id) || action.busy} onClick={() => void rewriteSlide(s, "headline")}>
                          {rewriting === `${s.slide_id}:headline` ? "다시 쓰는 중…" : "제목 다시 쓰기"}
                        </button>
                        <button className="btn sm" title={selectionDirty ? "장표 선택을 먼저 저장하세요" : undefined} disabled={selectionDirty || !included.has(s.slide_id) || action.busy} onClick={() => void rewriteSlide(s, "body")}>
                          {rewriting === `${s.slide_id}:body` ? "다듬는 중…" : "본문 다듬기"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Step C */}
      <section className="card" aria-labelledby="s-c">
        <div className="card-head">
          <div className="grow">
            <h2 id="s-c">③ 초안 내보내기</h2>
            <p>{edit?.edited ? `선택한 ${edit.slides.length}장으로 편집한 초안을 내려받습니다.` : "확인 항목이 남아 있어도 미리보기한 초안을 내려받을 수 있습니다."}</p>
          </div>
          <button className="btn primary lg" onClick={startExport} disabled={!canExport || action.busy} aria-describedby="export-conds">
            PPTX·원장 내보내기
          </button>
        </div>
        <div id="export-conds">
          <Checklist
            items={[
              { done: Boolean(deck), text: "초안이 있음" },
              { done: Boolean(deck) && ready.fresh, text: "초안이 현재 자료와 일치 (자료를 바꿨다면 다시 만들기)" },
              { done: Boolean(deck) && ready.render, text: "실제 PPTX 렌더 미리보기 확인됨" },
            ]}
          />
        </div>
        {exp?.state === "failed" && (
          <div className="mt12">
            <Notice tone="error">내보내지 못했습니다: {exp.error_message}</Notice>
          </div>
        )}
        {(exports ?? []).length > 0 && (
          <div className="mt24 stack">
            <h3>내보낸 파일</h3>
            {(exports ?? []).map((e, idx) => (
              <article key={e.id} className="sub">
                <div className="row wrap" style={{ marginBottom: 10 }}>
                  <strong>초안 v{e.deck_version}</strong>
                  {idx === 0 && <span className="badge b-brand">최신</span>}
                  <span className="small muted num">
                    {fmtDateTime(e.generated_at)} · 확인 권장 {e.qc.blocks + e.qc.warns}건
                  </span>
                </div>
                <ul className="grid cols-4" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
                  {[...e.files].sort((a, b) => (a === "report.pptx" ? -1 : b === "report.pptx" ? 1 : 0)).map((f) => (
                    <li key={f}>
                      <a className={`btn sm ${f === "report.pptx" ? "primary" : ""}`} style={{ width: "100%", justifyContent: "flex-start" }} href={fileUrl(`/exports/${e.id}/files/${f}`)} title={FILE_LABEL[f]?.[1]}>
                        ↓ {FILE_LABEL[f]?.[0] ?? f}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
