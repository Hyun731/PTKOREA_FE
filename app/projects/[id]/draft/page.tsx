"use client";

import Link from "next/link";
import { useState } from "react";
import { ChatThread, type ChatMessage } from "@/components/chat";
import { useProject } from "@/components/project-context";
import { ErrorBox, PageIntro } from "@/components/ui";
import { api, type Outline, type OutlineSlide } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

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
    await Promise.all([reload(), reloadProject()]);
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
      <PageIntro step="4단계" title="초안 흐름">
        PPT를 만들기 전에 장표 순서와 장마다 핵심 문장을 글로 봅니다. 장을 누르고 왼쪽에서 말로 고쳐 달라고 하세요.
      </PageIntro>
      <ErrorBox error={error ?? action.error} />
      {!outline ? (
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
                        <div className="title">{o.label}</div>
                        <div className="meta">{o.reason}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="small muted mt8">
                  자료를 모으면 들어갑니다 — <Link href={`/projects/${pid}/materials`}>자료 확인</Link>
                </p>
              </details>
            )}
          </article>
        </div>
      )}
      <div className="sticky-foot">
        <div className="row wrap">
          <span className="grow small muted">흐름이 괜찮으면 PPT를 만드세요. 여기서 고친 헤드라인은 PPT에 그대로 들어갑니다.</span>
          <Link href={`/projects/${pid}/output`} className="btn primary">
            다음 단계: PPT 만들기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
