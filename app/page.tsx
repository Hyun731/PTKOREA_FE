"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ImpactPanel, ImpactZone } from "@/components/impact";
import { STEPS } from "@/components/project-context";
import { ProjectForm, emptyBrand, type ProjectDraft } from "@/components/project-form";
import { useSidebarContent } from "@/components/shell";
import { ErrorBox, fmtDateTime } from "@/components/ui";
import { api, type Meta, type ProjectOut } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

type Row = { id: string; name: string; client: string; version: number; updated_at: string; brands: string[] };

const FIELD_LABEL: Record<string, string> = { name: "프로젝트 이름", client: "고객사", period: "조사 기간", brands: "브랜드" };

export default function Home() {
  const router = useRouter();
  const { data: projects, error } = useApi<Row[]>("/projects");
  const { data: meta } = useApi<Meta>("/meta");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>({
    name: "",
    client: "",
    period: { start: "2026-01-01", end: "2026-09-30" },
    brands: [emptyBrand(0)],
    enabled_slides: [],
    collection_cutoff: null,
    target_hypothesis: null,
  });
  const action = useAction();
  useEffect(() => {
    if (meta && draft.enabled_slides.length === 0) setDraft((d) => ({ ...d, enabled_slides: meta.default_slides }));
  }, [meta, draft.enabled_slides.length]);

  const create = () =>
    action.run(async () => {
      const brands = draft.brands.map((b) => ({ ...b, target: b.target?.label ? b.target : null }));
      const p = await api.post<ProjectOut>("/projects", { ...draft, brands });
      router.push(`/projects/${p.id}/setup`);
    }, "프로젝트를 만들었습니다");
  const sample = () =>
    action.run(async () => {
      const p = await api.post<ProjectOut>("/projects/sample");
      router.push(`/projects/${p.id}/materials`);
    }, "합성 샘플 프로젝트를 만들었습니다");

  const details = Array.isArray(action.error?.detail) ? (action.error!.detail as { loc: string; msg: string }[]) : [];
  const missing = !draft.name.trim() || !draft.client.trim() || !draft.brands[0]?.name.trim() || draft.brands[0]?.competitors.length === 0;

  useSidebarContent(
    <>
      <div className="sb-project">
        <div className="eyebrow">워크스페이스</div>
        <div className="name">리서치 팩트북</div>
      </div>
      <nav aria-label="프로젝트 목록">
        <ol className="sb-nav">
          {(projects ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}/setup`}>
                <span className="sb-dot" aria-hidden>
                  {p.name.trim().slice(0, 1) || "?"}
                </span>
                <span>
                  <span className="sb-label">{p.name}</span>
                  <br />
                  <span className="sb-hint">{p.client}</span>
                </span>
              </Link>
            </li>
          ))}
          {projects && projects.length === 0 && (
            <li className="sb-hint" style={{ padding: "6px 10px" }}>
              아직 프로젝트가 없습니다.
            </li>
          )}
        </ol>
      </nav>
    </>,
  );

  return (
    <div className="stack-lg">
      <ErrorBox error={error} />

      {!creating && (
        <div className="hero">
          <h1>프로젝트</h1>
          <p className="lede">브랜드와 경쟁사를 정하고 자료를 모으면, 모든 숫자가 근거에 연결된 진단 보고서 PPT를 만듭니다.</p>

          <ol className="roadmap" aria-label="전체 작업 흐름">
            {STEPS.map((s) => (
              <li key={s.slug}>
                {s.label} <span className="muted">— {s.desc}</span>
              </li>
            ))}
          </ol>

          <div className="hero-cta">
            <button className="btn primary lg" onClick={() => setCreating(true)}>
              새 프로젝트 만들기
            </button>
            <a
              href="#"
              className="small"
              onClick={(e) => {
                e.preventDefault();
                sample();
              }}
            >
              또는 가짜 데이터로 채워진 샘플 먼저 둘러보기
            </a>
          </div>
        </div>
      )}

      {creating && (
        <ImpactZone initial="project.name">
          <section aria-labelledby="new-title">
            <div className="intro">
              <div className="grow">
                <div className="step-no">새 프로젝트</div>
                <h2 id="new-title">진단형 프로젝트 만들기</h2>
                <p>* 표시는 필수입니다. 각 칸이 장표 어디에 쓰이는지 오른쪽에서 확인하세요. 나머지는 나중에 바꿀 수 있습니다.</p>
              </div>
            </div>
            <div className="with-impact">
              <div>
                <ProjectForm value={draft} onChange={setDraft} meta={meta} />
                <div className="sticky-foot">
                  {action.error && (
                    <div className="stack" style={{ marginBottom: 12 }}>
                      <ErrorBox error={action.error} />
                      {details.length > 0 && (
                        <ul className="small" style={{ color: "var(--bad)" }}>
                          {details.map((d, i) => (
                            <li key={i}>
                              {FIELD_LABEL[d.loc.split(".")[0]] ?? d.loc}: {d.msg}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="row wrap">
                    <span className="grow muted small">{missing ? "프로젝트 이름, 고객사, 첫 브랜드 이름과 경쟁사 1개 이상이 필요합니다." : "만든 뒤 섹션별 실제 조사 기간을 확인합니다."}</span>
                    <button className="btn" onClick={() => setCreating(false)}>
                      취소
                    </button>
                    <button className="btn primary" onClick={create} disabled={action.busy || missing}>
                      프로젝트 만들기
                    </button>
                  </div>
                </div>
              </div>
              <ImpactPanel />
            </div>
          </section>
        </ImpactZone>
      )}

      <section className="mt24" aria-labelledby="list-title" style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <h2 id="list-title">
          내 프로젝트 <span className="faint num">{projects?.length ?? ""}</span>
        </h2>
        {projects && projects.length === 0 && <p className="muted mt8">아직 프로젝트가 없습니다. 위에서 첫 프로젝트를 만들어보세요.</p>}
        {projects && projects.length > 0 && (
          <ul className="list mt12">
            {projects.map((p) => (
              <li key={p.id}>
                <div className="grow">
                  <Link href={`/projects/${p.id}/setup`} className="title" style={{ fontSize: 16 }}>
                    {p.name}
                  </Link>
                  <div className="meta">
                    {p.client} · 자사 {p.brands.join(", ")} · 마지막 수정 {fmtDateTime(p.updated_at)}
                  </div>
                </div>
                <div className="actions">
                  <Link href={`/projects/${p.id}/output`} className="btn sm">
                    출력 보기
                  </Link>
                  <Link href={`/projects/${p.id}/setup`} className="btn sm primary">
                    열기
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
