"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ImpactPanel, ImpactZone, WhereLine } from "@/components/impact";
import { ProjectForm, type ProjectDraft } from "@/components/project-form";
import { SECTION_LABEL, useProject } from "@/components/project-context";
import { ErrorBox, Notice, PageIntro, Status, fmtDate } from "@/components/ui";
import { api, type ProjectOut, type SectionWindow } from "@/lib/api";
import { useAction } from "@/lib/hooks";

export default function SetupPage() {
  const { project, meta, reload } = useProject();
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [windows, setWindows] = useState<SectionWindow[]>([]);
  const [editingWindow, setEditingWindow] = useState<Record<string, boolean>>({});
  const action = useAction();

  const original = useMemo(() => {
    if (!project) return null;
    const c = project.config;
    return { draft: { name: c.name, client: c.client, period: c.period, brands: c.brands, enabled_slides: c.enabled_slides, collection_cutoff: c.collection_cutoff, target_hypothesis: c.target_hypothesis }, windows: c.section_windows };
  }, [project]);

  useEffect(() => {
    if (original && !draft) {
      setDraft(original.draft);
      setWindows(original.windows);
    }
  }, [original, draft]);

  if (!project || !draft || !original) return <p className="muted">불러오는 중…</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original.draft) || JSON.stringify(windows) !== JSON.stringify(original.windows);

  const save = () =>
    action.run(async () => {
      const brands = draft.brands.map((b) => ({ ...b, target: b.target?.label ? b.target : null }));
      await api.patch<ProjectOut>(`/projects/${project.id}`, { base_version: project.version, changes: { ...draft, brands, section_windows: windows } });
      await reload();
      setDraft(null);
    }, "설정을 저장했습니다. 조사 계획도 갱신되었습니다");
  const discard = async () => {
    await reload();
    setDraft(null);
  };
  const setWin = (i: number, patch: Partial<SectionWindow>) => setWindows(windows.map((x, j) => (j === i ? { ...x, ...patch, source: "user" } : x)));

  return (
    <ImpactZone initial="brand.name">
      <PageIntro step="1단계" title="프로젝트 설정">무엇을, 누구와 비교해, 어느 기간으로 볼지 정합니다.</PageIntro>
      <div className="with-impact">
        <div className="stack-lg">
          {project.config.import_defaults_applied.length > 0 && <Notice>기존 정량 샘플에서 가져온 프로젝트라 보고서 유형과 섹션 기간을 가져오기 기본값으로 채웠습니다.</Notice>}
          <ProjectForm value={draft} onChange={setDraft} meta={meta} />

          <section className="card" aria-labelledby="win-title" data-impact="project.windows">
            <div className="card-head">
              <div className="grow">
                <h3 id="win-title">섹션별 실제 조사 기간</h3>
                <p>
                  전체 기간: <strong className="num">{fmtDate(project.config.period.start)} ~ {fmtDate(project.config.period.end)}</strong> — 다를 때만 체크 해제
                </p>
                <p className="mt4">
                  <WhereLine k="project.windows" />
                </p>
              </div>
            </div>
            <div className="frows">
              {windows.map((w, i) => {
                const name = SECTION_LABEL[w.section_id] ?? w.section_id;
                const { start: pStart, end: pEnd } = project.config.period;
                const same = w.start === pStart && w.end === pEnd;
                const editing = editingWindow[w.section_id] ?? !same;
                return (
                  <div className="frow" key={w.section_id}>
                    <div className="frow-label">
                      <span className="label">{name}</span>
                      {w.source === "import_default" && <div className="small faint">가져오기 기본값</div>}
                    </div>
                    <div className="frow-control">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!editing}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEditingWindow((m) => ({ ...m, [w.section_id]: !checked }));
                            if (checked) setWin(i, { start: pStart, end: pEnd });
                          }}
                        />
                        프로젝트 기간과 동일
                      </label>
                      {editing ? (
                        <div className="pair">
                          <input aria-label={`${name} 시작일`} type="date" value={w.start} onChange={(e) => setWin(i, { start: e.target.value })} />
                          <input aria-label={`${name} 종료일`} type="date" value={w.end} onChange={(e) => setWin(i, { end: e.target.value })} />
                        </div>
                      ) : (
                        <span className="small muted">{fmtDate(pStart)} ~ {fmtDate(pEnd)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="frow">
                <div className="frow-label">
                  <span className="label">검색 비교 창</span>
                  <div className="small faint">자동 계산</div>
                </div>
                <div className="frow-control" style={{ paddingTop: 10 }}>
                  <span className="num">
                    {project.comparison_window.label} · {fmtDate(project.comparison_window.start)} ~ {fmtDate(project.comparison_window.end)}
                  </span>
                  <span className="where">↳ 2-8a 브랜드명 검색 점유의 12개월 막대 기간</span>
                </div>
              </div>
            </div>
            <details className="more">
              <summary>수집 채널 지원 범위</summary>
              <p className="small muted mt8">‘키 미설정’ 채널은 자료 수집에서 직접 입력하거나 CSV로 보완합니다.</p>
              <ul className="list mt8">
                {(meta?.channels ?? []).map((c) => (
                  <li key={c.id}>
                    <span className="grow">{c.label}</span>
                    <span className="small muted">{c.support === "auto" ? "자동 수집 지원" : c.support === "manual_only" ? "직접 입력만" : "지원 안 함"}</span>
                    {c.support !== "unsupported" && <Status value={c.status === "ready" ? "ready_auto" : c.status} />}
                  </li>
                ))}
              </ul>
            </details>
          </section>

          <div className="sticky-foot">
            {action.error && (
              <div className="stack" style={{ marginBottom: 12 }}>
                <ErrorBox error={action.error} />
                {action.error.code === "STALE_VERSION" && (
                  <div>
                    <button className="btn sm" onClick={discard}>
                      최신 설정 불러오기 (내 변경은 버림)
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="row wrap">
              <span className="grow small" role="status">
                {dirty ? <strong style={{ color: "var(--warn)" }}>저장하지 않은 변경이 있습니다</strong> : <span className="muted">모든 변경이 저장되었습니다 · 설정 v{project.version}</span>}
              </span>
              {dirty && (
                <button className="btn ghost" onClick={() => { setDraft(original.draft); setWindows(original.windows); }}>
                  변경 취소
                </button>
              )}
              <Link href={`/projects/${project.id}/research`} className="btn">
                조사 계획으로 →
              </Link>
              <button className="btn primary" onClick={save} disabled={action.busy || !dirty}>
                설정 저장
              </button>
            </div>
          </div>
        </div>
        <ImpactPanel />
      </div>
    </ImpactZone>
  );
}
