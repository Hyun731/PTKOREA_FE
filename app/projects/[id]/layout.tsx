"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ProjectProvider, STEPS, useProject } from "@/components/project-context";
import { useSidebarContent } from "@/components/shell";
import { ErrorBox, fmtDate } from "@/components/ui";
import type { DeckOut } from "@/lib/api";
import { useApi } from "@/lib/hooks";

function Shell({ children }: { children: ReactNode }) {
  const { project, error, steps } = useProject();
  const pathname = usePathname() ?? "";
  const { id } = useParams<{ id: string }>();
  const synthetic = project?.name.includes("합성");
  const onStudio = pathname.endsWith("/studio");
  // "팩트북 출력" opens the editor on the latest ready draft; without a draft it stays on the output step.
  const { data: decks, reload: reloadDecks } = useApi<DeckOut[]>(id ? `/projects/${id}/decks` : null);
  const deckCount = (project as { counts?: { decks?: number } } | null)?.counts?.decks;
  useEffect(() => {
    void reloadDecks();
  }, [deckCount, reloadDecks]);
  const editorDeck = decks?.find((d) => d.status === "ready") ?? null;
  const stepHref = (slug: string) => (slug === "output" && editorDeck ? `/editor/${editorDeck.id}` : `/projects/${id}/${slug}`);

  useSidebarContent(
    <>
      <nav aria-label="작업 단계">
        <ol className="sb-nav">
          {STEPS.map((s, i) => {
            const active = pathname.endsWith(`/${s.slug}`);
            const st = steps[s.slug];
            const mark = st?.state === "done" ? "✓" : st?.state === "attn" ? "!" : String(i + 1);
            const stateText = st?.state === "done" ? "완료" : st?.state === "attn" ? "할 일 있음" : "시작 전";
            return (
              <li key={s.slug}>
                <Link href={stepHref(s.slug)} aria-current={active ? "page" : undefined}>
                  <span className={`sb-dot ${st?.state === "done" ? "done" : st?.state === "attn" ? "attn" : ""}`} aria-hidden>
                    {mark}
                  </span>
                  <span>
                    <span className="sb-label">
                      {i + 1}. {s.label}
                    </span>
                    <br />
                    <span className="sb-hint">
                      <span className="sr-only">{stateText} · </span>
                      {st?.hint}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="sb-sep" aria-hidden />
          <li>
            <Link href={`/projects/${id}/studio`} aria-current={onStudio ? "page" : undefined}>
              <span className="sb-dot" aria-hidden>
                ▣
              </span>
              <span>
                <span className="sb-label">장표 스튜디오</span>
                <br />
                <span className="sb-hint">숫자별 근거 확인</span>
              </span>
            </Link>
          </li>
        </ol>
      </nav>
    </>,
  );

  return (
    <div className="stack-lg">
      <div className="project-head">
        <Link href="/" className="back">
          ← 전체 프로젝트
        </Link>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <div className="grow">
            <div className="client">{project?.client ?? " "}</div>
            <h1>{project?.name ?? "불러오는 중…"}</h1>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {project && (
              <span className="badge b-outline num">
                {fmtDate(project.config.period.start)}~{fmtDate(project.config.period.end).slice(5)}
              </span>
            )}
            {synthetic && <span className="badge b-bad">합성 데이터</span>}
            <Link href={`/projects/${id}/studio`} className={`btn sm ${onStudio ? "primary" : ""}`}>
              장표 스튜디오
            </Link>
          </div>
        </div>

        <ol className="stepbar" aria-label="작업 단계">
          {STEPS.map((s, i) => {
            const active = pathname.endsWith(`/${s.slug}`);
            const st = steps[s.slug];
            const done = st?.state === "done";
            return (
              <li key={s.slug} className={done ? "done" : ""}>
                <Link href={`/projects/${id}/${s.slug}`} aria-current={active ? "step" : undefined}>
                  <span className="num" aria-hidden>
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="label">{s.label}</span>
                </Link>
                {i < STEPS.length - 1 && <span className="connector" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </div>

      <ErrorBox error={error} />
      {children}
    </div>
  );
}

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <ProjectProvider id={id}>
      <Shell>{children}</Shell>
    </ProjectProvider>
  );
}
