"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ProjectProvider, STEPS, useProject } from "@/components/project-context";
import { useSidebarContent } from "@/components/shell";
import { Dialog, ErrorBox, fmtDate } from "@/components/ui";
import type { DeckOut } from "@/lib/api";
import { useApi } from "@/lib/hooks";

function Shell({ children }: { children: ReactNode }) {
  const { project, error, steps, next } = useProject();
  const [nextOpen, setNextOpen] = useState(false);
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
      {project &&
        (next.length === 0 ? (
          <div className="sb-next done">
            <h2>다음 할 일</h2>
            <p className="small muted" style={{ margin: 0 }}>
              지금은 할 일이 없습니다.
            </p>
          </div>
        ) : (
          <div className="sb-next">
            <h2>다음 할 일</h2>
            <p className="small" style={{ margin: 0 }}>
              <span className="strong">{next.length}건</span> 남았습니다
            </p>
            <button className="btn sm primary mt8" style={{ width: "100%" }} onClick={() => setNextOpen(true)}>
              확인하기
            </button>
          </div>
        ))}
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
                  <span className="sb-text">
                    <span className="sb-label" title={`${i + 1}. ${s.label}`}>
                      {i + 1}. {s.label}
                    </span>
                    <span className="sb-hint" title={st?.hint}>
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
              <span className="sb-text">
                <span className="sb-label">장표 스튜디오</span>
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
      </div>

      <ErrorBox error={error} />
      {children}

      {nextOpen && (
        <Dialog variant="center" title="다음 할 일" subtitle={`${next.length}건`} onClose={() => setNextOpen(false)}>
          <ul className="list">
            {next.map((n, i) => (
              <li key={i}>
                <div className="grow">
                  <div className="title">{n.text}</div>
                  <div className="meta">{n.tab}</div>
                </div>
                <div className="actions">
                  <Link href={n.href} className="btn sm primary" onClick={() => setNextOpen(false)}>
                    이동
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
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
