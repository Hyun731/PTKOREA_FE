"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SECTION_LABEL, useProject } from "@/components/project-context";
import { SlideMap } from "@/components/slide-map";
import type { SlideKind } from "@/lib/impact";
import { Checklist, ErrorBox, Notice, PageIntro, ReasonButton, Stat, Status, fmtDateTime } from "@/components/ui";
import { api, fileUrl, type DeckOut, type ExportOut, type Job, type QCIssue } from "@/lib/api";
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
  if (["UNBOUND_NUMBER", "FACT_NOT_ELIGIBLE", "SOURCE_CONFLICT", "FACT_UNLINKED"].includes(i.code)) return { href: `${base}/review`, label: "검토·시사점에서 고치기" };
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
  const [buildJob, setBuildJob] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    if (latest?.status === "building" && latest.job_id) setBuildJob(latest.job_id); // reconnect after reload
  }, [latest?.status, latest?.job_id]);
  useEffect(() => {
    if (shown) void reloadDeck();
  }, [shown?.id, reloadDeck]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const startBuild = () =>
    action.run(async () => {
      const r = await api.post<{ job: Job }>(`/projects/${pid}/deck-builds`, undefined, { "Idempotency-Key": `build-${pid}-${Date.now()}` });
      setBuildJob(r.job.id);
      await reloadDecks();
    }, "초안 생성을 시작했습니다. 화면을 닫아도 계속 진행됩니다");
  const startExport = () =>
    action.run(async () => {
      if (!deck) return;
      const r = await api.post<{ job: Job }>(`/decks/${deck.id}/exports`, undefined, { "Idempotency-Key": `export-${deck.id}` });
      setExportJob(r.job.id);
    }, "내보내기를 시작했습니다");

  const blocks = plan.qc.issues.filter((i) => i.severity === "block");
  const warns = plan.qc.issues.filter((i) => i.severity === "warn" && i.code !== "SLOT_OMITTED");
  const building = Boolean(build && !["succeeded", "failed", "cancelled"].includes(build.state));
  const ready = { qc: (deck?.qc?.blocks ?? 1) === 0, fresh: Boolean(deck && !deck.stale), render: deck?.render_status === "ok" };
  const canExport = Boolean(deck && deck.status === "ready" && ready.qc && ready.fresh && ready.render);

  return (
    <div className="stack-lg">
      <PageIntro step="6단계" title="팩트북 출력">검수를 통과하면 초안을 만들고 내보냅니다.</PageIntro>
      {plan.synthetic_data && <Notice tone="warn">정량 장표가 합성 테스트 자료로 만들어집니다. 해당 장표와 표지에 ‘합성 테스트 자료’가 표시됩니다.</Notice>}

      <div className="stats" aria-label="장표 현황">
        <Stat k="계획한 장표" v={plan.counts.planned} />
        <Stat k="만들 수 있는 장표" v={plan.counts.generated} tone="ok" />
        <Stat k="자료가 없어 빠진 장표" v={plan.counts.needs_input} />
        <Stat k="출력 페이지 수" v={plan.counts.pages} />
      </div>
      <ErrorBox error={action.error} />

      {/* Step A */}
      <section className="card" aria-labelledby="s-a">
        <div className="card-head">
          <div className="grow">
            <h2 id="s-a">① 출력 전 검수</h2>
            <p>차단 항목이 0이어야 내보낼 수 있습니다.</p>
          </div>
          {blocks.length === 0 ? <span className="badge b-ok">✓ 차단 없음</span> : <span className="badge b-bad">✕ 차단 {blocks.length}건</span>}
        </div>
        {blocks.length > 0 && (
          <ul className="list">
            {blocks.map((i, k) => {
              const fix = fixLink(pid, i);
              return (
                <li key={k}>
                  <Status value="block" />
                  <div className="grow">
                    <div className="strong">{i.message}</div>
                    <div className="meta">
                      {i.slide_id ? `${i.slide_id} 장표 · ` : ""}
                      {i.action}
                    </div>
                  </div>
                  {fix && (
                    <a className="btn sm" href={fix.href}>
                      {fix.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {warns.length > 0 && (
          <details className="more">
            <summary>확인할 경고 {warns.length}건</summary>
            <ul className="list mt8">
              {warns.map((i, k) => (
                <li key={k}>
                  <Status value="warn" />
                  <div className="grow">
                    <div>{i.message}</div>
                    <div className="meta">
                      {i.slide_id ? `${i.slide_id} 장표 · ` : ""}
                      {i.action}
                    </div>
                  </div>
                </li>
              ))}
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
                  <Status value={s.readiness} />
                </td>
                <td className="small">{s.readiness === "ready" ? `${s.slide_ids.length}장 생성` : s.reason}</td>
                <td style={{ textAlign: "right" }}>
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
          <button className="btn primary" onClick={startBuild} disabled={action.busy || building}>
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
            {deck.render_status !== "ok" && <Notice tone="warn">{deck.render_message ?? "실제 렌더 미리보기를 만들지 못했습니다."}</Notice>}
            <ul className="slides" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(deck.spec?.slides ?? []).map((s, i) => (
                <li key={s.slide_id}>
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
            <h2 id="s-c">③ 확정 내보내기</h2>
            <p>미리보기한 파일 그대로 PPTX와 원장을 내보냅니다.</p>
          </div>
          <button className="btn primary lg" onClick={startExport} disabled={!canExport || action.busy} aria-describedby="export-conds">
            PPTX·원장 내보내기
          </button>
        </div>
        <div id="export-conds">
          <Checklist
            items={[
              { done: Boolean(deck), text: "초안이 있음" },
              { done: Boolean(deck) && ready.qc, text: "검수 차단 0건" },
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
                    {fmtDateTime(e.generated_at)} · 검수 차단 {e.qc.blocks} · 경고 {e.qc.warns}
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
