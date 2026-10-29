"use client";

import { useState } from "react";
import { ChatThread, type ChatMessage } from "@/components/chat";
import { CroppedImage } from "@/components/crop";
import { Dialog, ErrorBox, Status, fmtDate } from "@/components/ui";
import { api, type Claim, type Material } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

const KIND: Record<Claim["kind"], string> = { fact: "사실", interpretation: "관찰", recommendation: "제언" };

/** Left sidebar: a conversation about this material; the page answers first, the web when it does not say. */
function ChatSide({ m }: { m: Material }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const action = useAction();
  const ask = (message: string) =>
    void action.run(async () => {
      const history = messages.map(({ role, text }) => ({ role, text }));
      setMessages((x) => [...x, { role: "user", text: message }]);
      const r = await api.post<{ answer: string; sources: { title: string; url: string }[]; searched: string | null }>(`/materials/${m.id}/chat`, { message, history });
      setMessages((x) => [...x, { role: "ai", text: r.answer, links: r.sources, note: r.searched ? `‘${r.searched}’로 웹에서 더 찾아봤어요` : null }]);
    });
  return (
    <aside className="studio-side" aria-label="이 자료에 대해 묻기">
      <h4>이 자료에 대해 묻기</h4>
      <ChatThread
        messages={messages}
        busy={action.busy}
        onSend={ask}
        placeholder="무엇이든 물어보세요"
        starters={["왜 이 활동을 했어?", "반응이나 성과는 어땠어?", "비슷한 다른 사례도 있어?"]}
        empty={<p style={{ margin: 0 }}>원문을 읽고 답합니다. 원문에 없으면 웹에서 한 번 더 찾아보고 출처를 붙여 드려요.</p>}
        error={<ErrorBox error={action.error} />}
      />
    </aside>
  );
}

/** Middle: what this material is — image, source, 해석 요약. */
function UnderstandPane({ m, onChanged }: { m: Material; onChanged: () => Promise<void> }) {
  const asset = m.assets.find((a) => a.id === m.selected_asset_id) ?? m.assets[0];
  const action = useAction();
  const summarize = () =>
    action.run(async () => {
      await api.post(`/materials/${m.id}/summary`);
      await onChanged();
    });
  return (
    <div className="studio-pane">
      <div className="studio-image">{asset ? <CroppedImage asset={asset} /> : <span className="muted small">이미지 없음</span>}</div>
      <div className="small muted">
        {m.source.publisher ?? "출처"} · {fmtDate(m.activity_date ?? m.source.published_at)}
        {m.source.url && (
          <>
            {" · "}
            <a href={m.source.url} target="_blank" rel="noreferrer">
              원문 보기 ↗
            </a>
          </>
        )}
      </div>
      <section aria-labelledby={`sum-${m.id}`}>
        <h4 id={`sum-${m.id}`}>해석 요약</h4>
        {m.summary ? (
          <p className="studio-summary">{m.summary}</p>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted grow">아직 요약이 없습니다.</span>
            <button className="btn sm" disabled={action.busy} onClick={summarize}>
              요약 만들기
            </button>
          </div>
        )}
        <ErrorBox error={action.error} />
      </section>
    </div>
  );
}

/** Right: what goes on the slide — sentences to keep or drop, AI ideas (B), writing with 다듬기 (C). */
function WritePane({ m, onChanged }: { m: Material; onChanged: () => Promise<void> }) {
  const [ideas, setIdeas] = useState<{ kind: "fact" | "interpretation"; text: string; quote: string }[] | null>(null);
  const [draft, setDraft] = useState("");
  const action = useAction();
  const claims = m.claims.filter((c) => c.review_status !== "excluded");
  const dropped = m.claims.filter((c) => c.review_status === "excluded");
  const setClaim = (c: Claim, review_status: string) =>
    action.run(async () => {
      await api.patch(`/claims/${c.id}`, { base_version: c.version, review_status });
      await onChanged();
    });
  const suggest = () =>
    action.run(async () => {
      const r = await api.post<{ suggestions: { kind: "fact" | "interpretation"; text: string; quote: string }[] }>(`/materials/${m.id}/claim-suggestions`);
      setIdeas(r.suggestions);
    });
  const take = (i: { kind: string; text: string; quote: string }) =>
    action.run(async () => {
      await api.post(`/materials/${m.id}/claims`, { ...i, accept: true });
      setIdeas((x) => (x ?? []).filter((y) => y.text !== i.text));
      await onChanged();
    }, "문장을 넣었습니다");
  const polish = () =>
    action.run(async () => {
      const r = await api.post<{ text: string }>(`/materials/${m.id}/polish`, { text: draft });
      setDraft(r.text);
    });
  const add = () =>
    action.run(async () => {
      await api.post(`/materials/${m.id}/claims`, { kind: "interpretation", text: draft.trim(), accept: true });
      setDraft("");
      await onChanged();
    }, "문장을 넣었습니다");
  return (
    <div className="studio-pane">
      <section aria-labelledby={`cl-${m.id}`}>
        <div className="row" style={{ gap: 8 }}>
          <h4 id={`cl-${m.id}`} className="grow">
            장표에 쓸 문장
          </h4>
          <button className="btn sm" disabled={action.busy} onClick={suggest}>
            AI 추천 받기
          </button>
        </div>
        {claims.length === 0 && <p className="small muted">아직 문장이 없습니다. AI 추천을 받거나 아래에 직접 쓰세요.</p>}
        <ul className="studio-claims">
          {claims.map((c) => (
            <li key={c.id} className={c.review_status === "accepted" ? "on" : ""}>
              <span className="badge b-outline">{KIND[c.kind]}</span>
              <div className="grow">
                <div>{c.text}</div>
                {c.quote && <div className="small faint">원문: “{c.quote.slice(0, 90)}{c.quote.length > 90 ? "…" : ""}”</div>}
                {c.issues.map((i) => (
                  <div key={i} className="small" style={{ color: "var(--bad)" }}>
                    {i}
                  </div>
                ))}
              </div>
              {c.review_status === "accepted" ? (
                <button className="btn sm ghost" onClick={() => setClaim(c, "pending")} aria-label={`‘${c.text}’ 채택 취소`}>
                  ✓ 채택됨
                </button>
              ) : (
                <button className="btn sm ok" disabled={c.issues.length > 0} onClick={() => setClaim(c, "accepted")}>
                  채택
                </button>
              )}
              <button className="btn sm ghost" onClick={() => setClaim(c, "excluded")} aria-label={`‘${c.text}’ 빼기`}>
                빼기
              </button>
            </li>
          ))}
        </ul>
        {ideas && (
          <div className="studio-ideas">
            <div className="small muted">AI 추천 — 눌러서 넣으면 바로 채택됩니다</div>
            {ideas.length === 0 && <div className="small muted">원문에서 근거를 찾은 추천이 없습니다.</div>}
            {ideas.map((i) => (
              <button key={i.text} className="idea" disabled={action.busy} onClick={() => take(i)}>
                <span className="badge b-outline">{KIND[i.kind]}</span> {i.text}
                <span className="small faint" style={{ display: "block" }}>
                  원문: “{i.quote.slice(0, 80)}{i.quote.length > 80 ? "…" : ""}”
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby={`wr-${m.id}`}>
        <h4 id={`wr-${m.id}`}>직접 쓰기</h4>
        <textarea rows={3} aria-label="장표 문장 직접 쓰기" value={draft} placeholder="대충 써도 됩니다. ‘다듬기’를 누르면 보고서 말투로 고쳐 줍니다." onChange={(e) => setDraft(e.target.value)} />
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="btn sm" disabled={action.busy || !draft.trim()} onClick={polish}>
            다듬기
          </button>
          <button className="btn sm primary" disabled={action.busy || !draft.trim()} onClick={add}>
            넣기
          </button>
        </div>
      </section>
      <ErrorBox error={action.error} />
      {dropped.length > 0 && (
        <details className="more">
          <summary>뺀 문장 ({dropped.length})</summary>
          <ul className="studio-claims mt8">
            {dropped.map((c) => (
              <li key={c.id}>
                <div className="grow muted">{c.text}</div>
                <button className="btn sm ghost" onClick={() => setClaim(c, "pending")}>
                  되돌리기
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** One material, understood and decided on one screen. */
export function MaterialStudio({ id, onClose, onChanged, onDetail }: { id: string; onClose: () => void; onChanged: () => void; onDetail: () => void }) {
  const { data: m, reload } = useApi<Material>(`/materials/${id}`);
  const action = useAction();
  const refresh = async () => {
    await reload();
    onChanged();
  };
  const review = (status: "accepted" | "excluded" | "candidate", msg: string) =>
    action.run(async () => {
      await api.patch(`/materials/${id}/review`, { status });
      await refresh();
      if (status !== "candidate") onClose();
    }, msg);
  return (
    <Dialog
      wide
      title={m?.event_name || m?.title || "자료"}
      subtitle={m ? `${m.entity ?? ""}${m.event_name ? ` · ${m.title}` : ""}` : undefined}
      badge={m ? <Status value={m.review_status} /> : undefined}
      onClose={onClose}
      footer={
        m && (
          <>
            <button className="btn ghost" onClick={onDetail}>
              이미지·수치·출처 편집
            </button>
            <span className="grow" />
            <ErrorBox error={action.error} />
            {m.review_status === "excluded" ? (
              <button className="btn" disabled={action.busy} onClick={() => review("candidate", "되돌렸습니다")}>
                되돌리기
              </button>
            ) : (
              <button className="btn danger" disabled={action.busy} onClick={() => review("excluded", "자료를 뺐습니다 · ‘제외된 자료’에서 되돌릴 수 있습니다")}>
                이 자료 빼기
              </button>
            )}
            {m.review_status !== "accepted" && (
              <button className="btn primary" disabled={action.busy || Boolean(m.duplicate_of)} onClick={() => review("accepted", "자료를 채택했습니다")}>
                이 자료 채택
              </button>
            )}
          </>
        )
      }
    >
      {!m ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <div className="studio with-chat">
          <ChatSide m={m} />
          <UnderstandPane m={m} onChanged={refresh} />
          <WritePane m={m} onChanged={refresh} />
        </div>
      )}
    </Dialog>
  );
}
