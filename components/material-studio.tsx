"use client";

import { useState } from "react";
import { ChatThread, type ChatMessage } from "@/components/chat";
import { CroppedImage } from "@/components/crop";
import { Dialog, ErrorBox, FileButton, Status, fmtDate } from "@/components/ui";
import { api, type Asset, type Claim, type FactOut, type Material } from "@/lib/api";
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

/** An empty spot that takes a value right where it is: blank → type → saved on Enter or leaving the field. */
function FillIn({ label, type = "text", onSave }: { label: string; type?: "text" | "date"; onSave: (v: string) => void }) {
  const [v, setV] = useState("");
  const save = () => v.trim() && onSave(v.trim());
  return (
    <input className="fill-in" type={type} aria-label={label} placeholder={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()} />
  );
}

const FACT_STATE: Record<string, [string, string]> = { eligible: ["맞음", "b-ok"], rejected: ["뺌", "b-outline"], candidate: ["확인 전", "b-warn"] };

/** Middle: what this material is — image, source, 해석 요약, numbers from the page. Gaps are filled in place. */
function UnderstandPane({ m, projectId, onChanged }: { m: Material; projectId: string; onChanged: () => Promise<void> }) {
  const asset = m.assets.find((a) => a.id === m.selected_asset_id) ?? m.assets.find((a) => a.review_status !== "excluded");
  const others = m.assets.filter((a) => a.review_status !== "excluded");
  const action = useAction();
  const run = (fn: () => Promise<unknown>, msg?: string) =>
    action.run(async () => {
      await fn();
      await onChanged();
    }, msg);
  // The image shown is the one the slide uses: picking or adding it also adopts it.
  const pickImage = (a: Asset) =>
    run(async () => {
      await api.post(`/materials/${m.id}/select-asset`, { asset_id: a.id });
      if (a.review_status !== "accepted") await api.patch(`/assets/${a.id}`, { review_status: "accepted" });
    });
  const upload = (file: File) =>
    run(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const a = await api.post<Asset>(`/materials/${m.id}/assets`, fd);
      await api.post(`/materials/${m.id}/select-asset`, { asset_id: a.id });
      await api.patch(`/assets/${a.id}`, { review_status: "accepted" });
    }, "이미지를 넣었습니다");
  const fromSource = () => run(() => api.post(`/materials/${m.id}/fetch-source`), "원문에서 이미지와 정보를 가져왔습니다");
  const patch = (changes: Record<string, string>) => run(() => api.patch(`/materials/${m.id}`, { base_version: m.version, ...changes }));
  const fact = (f: FactOut, action_: "confirm" | "reject") =>
    run(() => api.patch(`/facts/${f.id}/review?project_id=${projectId}`, { action: action_, note: action_ === "reject" ? "자료 카드에서 뺌" : undefined }));
  const summarize = () => run(() => api.post(`/materials/${m.id}/summary`));
  const date = m.activity_date ?? m.source.published_at;
  return (
    <div className="studio-pane">
      {asset ? (
        <div className="studio-image">
          <CroppedImage asset={asset} />
        </div>
      ) : (
        <div className="studio-image empty-image" tabIndex={0} aria-label="이미지 붙여넣기"
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
            if (f) upload(f);
          }}>
          <div className="stack" style={{ alignItems: "center", gap: 8 }}>
            <span className="muted small">장표에 쓸 이미지가 없습니다</span>
            <div className="row wrap" style={{ gap: 8, justifyContent: "center" }}>
              {m.source.url && (
                <button className="btn sm primary" disabled={action.busy} onClick={fromSource}>
                  원문에서 가져오기
                </button>
              )}
              <FileButton label="이미지 올리기" accept="image/png,image/jpeg,image/webp" onFile={upload} disabled={action.busy} />
            </div>
            <span className="faint small">캡처한 이미지를 여기에 붙여넣어도 됩니다</span>
          </div>
        </div>
      )}
      {(others.length > 1 || asset) && (
        <div className="thumbs" role="group" aria-label="장표에 쓸 이미지 고르기">
          {others.length > 1 &&
            others.map((a) => (
              <button key={a.id} className={`thumb-pick ${a.id === asset?.id ? "on" : ""}`} aria-pressed={a.id === asset?.id} onClick={() => pickImage(a)} disabled={action.busy}>
                <CroppedImage asset={a} />
              </button>
            ))}
          <FileButton label={others.length > 1 ? "+" : "다른 이미지 올리기"} accept="image/png,image/jpeg,image/webp" onFile={upload} disabled={action.busy} />
        </div>
      )}
      <div className="small muted row wrap" style={{ gap: 6 }}>
        {m.source.publisher ? <span>{m.source.publisher}</span> : <FillIn label="매체 이름" onSave={(v) => patch({ publisher: v })} />}
        <span>·</span>
        {date ? <span>{fmtDate(date)}</span> : <FillIn label="활동 날짜" type="date" onSave={(v) => patch({ activity_date: v })} />}
        {m.source.url && (
          <>
            <span>·</span>
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
      </section>
      {m.facts.length > 0 && (
        <section aria-labelledby={`fx-${m.id}`}>
          <h4 id={`fx-${m.id}`}>원문 수치</h4>
          <ul className="studio-claims">
            {m.facts.map((f) => {
              const [label, cls] = FACT_STATE[f.verification_status] ?? [f.verification_status, "b-outline"];
              return (
                <li key={f.id} className={f.verification_status === "eligible" ? "on" : ""}>
                  <div className="grow">
                    <strong className="num">{f.display ?? f.value}</strong> <span className="muted">{f.label}</span>
                    {f.review_note && <div className="small faint">{f.review_note.replace(/^AI 추출 · /, "")}</div>}
                  </div>
                  {f.verification_status === "candidate" ? (
                    <>
                      <button className="btn sm ok" disabled={action.busy} onClick={() => fact(f, "confirm")}>
                        맞음
                      </button>
                      <button className="btn sm ghost" disabled={action.busy} onClick={() => fact(f, "reject")}>
                        빼기
                      </button>
                    </>
                  ) : (
                    <span className={`badge ${cls}`}>{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ErrorBox error={action.error} />
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
export function MaterialStudio({ id, projectId, onClose, onChanged }: { id: string; projectId: string; onClose: () => void; onChanged: () => void }) {
  const { data: m, reload } = useApi<Material>(`/materials/${id}`);
  const action = useAction();
  const refresh = async () => {
    await reload();
    onChanged();
  };
  const review = (status: "accepted" | "excluded" | "candidate", msg: string) =>
    action.run(async () => {
      // Adopting the card adopts the image it shows, so the slide has what the person saw.
      const shown = m?.assets.find((a) => a.id === m.selected_asset_id);
      if (status === "accepted" && shown && shown.review_status !== "accepted") await api.patch(`/assets/${shown.id}`, { review_status: "accepted" });
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
          <UnderstandPane m={m} projectId={projectId} onChanged={refresh} />
          <WritePane m={m} onChanged={refresh} />
        </div>
      )}
    </Dialog>
  );
}
