"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ImpactPanel, ImpactZone } from "@/components/impact";
import { ProjectForm, type ProjectDraft } from "@/components/project-form";
import { useProject } from "@/components/project-context";
import { ErrorBox, Notice, PageIntro } from "@/components/ui";
import { api, type ProjectOut } from "@/lib/api";
import { useAction } from "@/lib/hooks";

export default function SetupPage() {
  const { project, meta, reload } = useProject();
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const action = useAction();

  const original = useMemo(() => {
    if (!project) return null;
    const c = project.config;
    return { draft: { name: c.name, client: c.client, period: c.period, brands: c.brands, collection_cutoff: c.collection_cutoff, target_hypothesis: c.target_hypothesis } };
  }, [project]);

  useEffect(() => {
    if (original && !draft) {
      setDraft(original.draft);
    }
  }, [original, draft]);

  if (!project || !draft || !original) return <p className="muted">불러오는 중…</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original.draft);

  const save = () =>
    action.run(async () => {
      const brands = draft.brands.map((b) => ({ ...b, target: b.target?.label ? b.target : null }));
      await api.patch<ProjectOut>(`/projects/${project.id}`, { base_version: project.version, changes: { ...draft, brands } });
      await reload();
      setDraft(null);
    }, "설정을 저장했습니다. 조사 계획도 갱신되었습니다");
  const discard = async () => {
    await reload();
    setDraft(null);
  };

  return (
    <ImpactZone initial="brand.name">
      <PageIntro step="1단계" title="프로젝트 설정">무엇을, 누구와 비교해, 어느 기간으로 볼지 정합니다.</PageIntro>
      <div className="with-impact">
        <div className="stack-lg">
          {project.config.import_defaults_applied.length > 0 && <Notice>기존 정량 샘플에서 가져온 프로젝트라 보고서 유형과 섹션 기간을 가져오기 기본값으로 채웠습니다.</Notice>}
          <ProjectForm value={draft} onChange={setDraft} meta={meta} />

          <Notice>조사 기간과 채널은 2단계 조사 계획에서 항목마다 정합니다. 기본값은 위 조사 기간을 따릅니다.</Notice>

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
                <button className="btn ghost" onClick={() => { setDraft(original.draft); }}>
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
