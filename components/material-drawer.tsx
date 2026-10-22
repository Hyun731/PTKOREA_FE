"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CropTool, CroppedImage } from "@/components/crop";
import { ImpactZone, WhereLine, useImpactZone } from "@/components/impact";
import { SECTION_LABEL, useProject } from "@/components/project-context";
import { Checklist, Dialog, ErrorBox, Field, FileButton, KIND_LABEL, Kind, Notice, Parts, ReasonButton, Status, fmtDate } from "@/components/ui";
import { api, type Asset, type Claim, type FactOut, type Material } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

const METRIC_LABEL: Record<string, string> = { views: "조회", likes: "좋아요", comments: "댓글", followers: "팔로워·구독자", count: "건수", amount_krw: "금액(원)", percent: "비율(%)", rank: "순위" };
type Tab = "source" | "image" | "facts" | "claims";
const TAB_IMPACT: Record<Tab, string> = { source: "material.label", image: "material.image", facts: "material.fact", claims: "claim.fact" };
type ActionT = ReturnType<typeof useAction>;

export function MaterialDrawer({ id: initialId, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [id, setId] = useState(initialId); // the drawer can move to another card of the same activity
  const { data: m, reload, setData } = useApi<Material>(`/materials/${id}`);
  const action = useAction();
  const [tab, setTab] = useState<Tab | null>(null); // null until data loads, so we can open on the first unfinished step
  const refresh = async () => {
    await reload();
    onChanged();
  };

  const needsImage = m ? ["campaign", "influencer"].includes(m.section_id) : false;
  const needsClaim = m ? ["campaign", "market"].includes(m.section_id) : false;
  const img = m?.assets.find((a) => a.id === m.selected_asset_id);
  const checklist = m
    ? [
        { done: Boolean(m.source.url || m.source.publisher), text: "출처(URL 또는 발행처) 입력", tab: "source" as Tab },
        { done: Boolean(m.source.published_at || m.activity_date || m.facts.some((f) => f.verification_status === "eligible")), text: "날짜 입력 (발행일·활동일 또는 수치 측정일 — 장표 각주에 필요)", tab: "source" as Tab },
        ...(needsImage ? [{ done: Boolean(img && img.review_status === "accepted"), text: "장표에 쓸 이미지 선택·채택", tab: "image" as Tab }] : []),
        { done: m.facts.every((f) => f.verification_status !== "candidate"), text: "입력한 수치를 원문과 대조", tab: "facts" as Tab },
        ...(needsClaim ? [{ done: m.claims.some((c) => c.review_status === "accepted") && !m.claims.some((c) => c.review_status === "stale"), text: "근거 문장 1개 이상 채택", tab: "claims" as Tab }] : []),
        { done: m.review_status === "accepted", text: "자료 채택", tab: null },
      ]
    : [];
  useEffect(() => {
    if (m && tab === null) setTab(checklist.find((c) => !c.done && c.tab)?.tab ?? "source");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(m)]);
  const activeTab = tab ?? "source";

  const review = (status: string, reason?: string, msg?: string) =>
    action.run(async () => {
      await api.patch(`/materials/${id}/review`, { status, reason });
      await refresh();
    }, msg);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "source", label: "1 출처·카드 정보" },
    { id: "image", label: "2 이미지", count: m?.assets.length },
    { id: "facts", label: "3 성과 수치", count: m?.facts.length },
    { id: "claims", label: "4 근거 문장", count: m?.claims.length },
  ];

  return (
    <Dialog
      title={m?.title ?? "불러오는 중…"}
      subtitle={m ? `${SECTION_LABEL[m.section_id]} · ${m.entity ?? "대상 미지정"} · ${m.input_path === "manual" ? "직접 입력" : "자동 수집"}` : undefined}
      badge={m ? <Status value={m.review_status} /> : undefined}
      onClose={onClose}
      footer={
        m && (
          <div className="row wrap" style={{ width: "100%" }}>
            <span className="grow small muted">채택은 ‘이 자료를 보고서에 쓴다’는 결정입니다. 데이터 품질 등급과는 다릅니다.</span>
            {m.review_status !== "excluded" && <ReasonButton sm={false} label="자료 제외" title="이 자료 제외" danger onSubmit={(r) => review("excluded", r, "자료를 제외했습니다").then(() => undefined)} />}
            {m.review_status !== "candidate" && (
              <button className="btn ghost" onClick={() => review("candidate", undefined, "검토 전으로 되돌렸습니다")}>
                검토 전으로
              </button>
            )}
            {m.review_status !== "accepted" && !m.duplicate_of && (
              <button className="btn primary" onClick={() => review("accepted", undefined, "자료를 채택했습니다")}>
                자료 채택
              </button>
            )}
          </div>
        )
      }
    >
      {m && (
        <ImpactZone key={`${m.id}-${activeTab}`} initial={TAB_IMPACT[activeTab]}>
        <div className="stack">
          <ErrorBox error={action.error} />
          {(m.duplicate_of || m.duplicates.length > 0) && <SameActivity m={m} action={action} refresh={refresh} open={setId} />}
          {!m.duplicate_of && (
          <section className="sub" aria-label="장표 사용 준비 상태">
            <div className="row between" style={{ marginBottom: 8 }}>
              <h3>장표에 쓰려면</h3>
              <span className="small muted num">
                {checklist.filter((c) => c.done).length}/{checklist.length} 완료
              </span>
            </div>
            <Checklist
              items={checklist.map((c) => ({
                done: c.done,
                text: c.tab && !c.done ? (
                  <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setTab(c.tab!)}>
                    {c.text} →
                  </button>
                ) : (
                  c.text
                ),
              }))}
            />
          </section>
          )}
          {!m.duplicate_of && m.duplicates.length === 0 && <SameActivity m={m} action={action} refresh={refresh} open={setId} collapsedHint />}

          <div className="tabs" role="tablist" aria-label="자료 입력 단계">
            {tabs.map((t) => (
              <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.count ? <span className="badge b-outline num">{t.count}</span> : null}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
            {activeTab === "source" && <SourceEditor m={m} onSaved={(nm) => { setData(nm); onChanged(); }} />}
            {activeTab === "image" && <ImagesPanel m={m} action={action} refresh={refresh} />}
            {activeTab === "facts" && <FactsPanel m={m} action={action} refresh={refresh} />}
            {activeTab === "claims" && <ClaimsPanel m={m} action={action} refresh={refresh} />}
          </div>
        </div>
        </ImpactZone>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ same activity from several outlets */

function SameActivity({ m, action, refresh, open, collapsedHint }: { m: Material; action: ActionT; refresh: () => Promise<void>; open: (id: string) => void; collapsedHint?: boolean }) {
  const { project } = useProject();
  const [picking, setPicking] = useState(false);
  const { data: others } = useApi<Material[]>(picking && project ? `/projects/${project.id}/materials?section_id=${m.section_id}` : null);
  const [target, setTarget] = useState("");
  const call = (url: string, body: object, msg: string, after?: () => void) =>
    action.run(async () => {
      await api.post(url, body);
      after?.();
      await refresh();
    }, msg);
  const candidates = (others ?? []).filter((o) => o.id !== m.id && !o.duplicate_of && o.entity === m.entity);

  if (collapsedHint && !picking) {
    return (
      <button className="btn ghost sm" onClick={() => setPicking(true)}>
        다른 카드를 같은 사례로 묶기
      </button>
    );
  }

  if (m.duplicate_of) {
    return (
      <Notice tone="warn">
        <strong>같은 사례의 추가 출처입니다.</strong> 장표에는 대표 자료 하나만 쓰이고, 이 카드는 따로 채택하지 않습니다.
        {m.duplicate_reason && <span className="muted"> (묶인 이유: {m.duplicate_reason})</span>}
        <div className="row wrap mt8">
          <button className="btn sm" onClick={() => open(m.duplicate_of!)}>
            대표 자료 열기
          </button>
          <button className="btn sm" disabled={action.busy} onClick={() => call(`/materials/${m.id}/duplicate`, { make_primary: true }, "이 출처를 대표 자료로 바꿨습니다")}>
            이 출처를 대표로
          </button>
          <button className="btn sm ghost" disabled={action.busy} onClick={() => call(`/materials/${m.id}/duplicate`, { of: null }, "별개 사례로 분리했습니다")}>
            다른 사례예요 — 분리
          </button>
        </div>
      </Notice>
    );
  }
  return (
    <section className="sub" aria-labelledby="same-title">
      <div className="row between">
        <h3 id="same-title">같은 사례의 다른 출처 {m.duplicates.length > 0 && <span className="badge b-outline num">{m.duplicates.length}</span>}</h3>
        {!picking && (
          <button className="btn ghost sm" onClick={() => setPicking(true)}>
            다른 카드를 이 사례로 묶기
          </button>
        )}
      </div>
      {m.duplicates.length === 0 && !picking && <p className="small muted mt4">같은 활동을 다룬 다른 기사가 들어오면 이 카드 아래로 자동으로 묶입니다.</p>}
      {m.duplicates.length > 0 && (
        <ul className="list mt8">
          {m.duplicates.map((d) => (
            <li key={d.id}>
              <div className="grow">
                <div className="title">{d.title}</div>
                <div className="meta">
                  {[d.publisher, fmtDate(d.published_at)].filter(Boolean).join(" · ")}
                  {d.reason && ` · 묶인 이유: ${d.reason}`}
                </div>
              </div>
              <div className="actions">
                <button className="btn sm" onClick={() => open(d.id)}>
                  열기
                </button>
                <button className="btn sm ghost" disabled={action.busy} onClick={() => call(`/materials/${d.id}/duplicate`, { of: null }, "별개 사례로 분리했습니다")}>
                  분리
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {picking && (
        <div className="row wrap mt8">
          <label className="sr-only" htmlFor="same-pick">
            이 사례로 묶을 카드
          </label>
          <select id="same-pick" className="grow" style={{ width: "auto" }} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{others ? (candidates.length ? "같은 활동을 다룬 카드 선택" : "같은 대상의 다른 카드가 없습니다") : "불러오는 중…"}</option>
            {candidates.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {fmtDate(o.activity_date ?? o.source.published_at)}
              </option>
            ))}
          </select>
          <button className="btn sm primary" disabled={!target || action.busy} onClick={() => call(`/materials/${target}/duplicate`, { of: m.id }, "같은 사례로 묶었습니다", () => { setTarget(""); setPicking(false); })}>
            묶기
          </button>
          <button className="btn sm ghost" onClick={() => setPicking(false)}>
            취소
          </button>
        </div>
      )}
    </section>
  );
}

function SourceEditor({ m, onSaved }: { m: Material; onSaved: (m: Material) => void }) {
  const { project } = useProject();
  const init = { title: m.title, url: m.source.url ?? "", publisher: m.source.publisher ?? "", published_at: m.source.published_at ?? "", label: m.label ?? "", entity: m.entity ?? "", comment: m.comment, activity_date: m.activity_date ?? "", activity_date_end: m.activity_date_end ?? "", featured: m.featured };
  const [f, setF] = useState(init);
  const action = useAction();
  // A competitor can be shared by several brands (e.g. one rival for two lines); list it once.
  const entities = [...new Set(project?.config.brands.flatMap((b) => [b.name, ...b.competitors, ...b.benchmarks]) ?? [])];
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const save = () =>
    action.run(async () => {
      const nm = await api.patch<Material>(`/materials/${m.id}`, {
        base_version: m.version,
        title: f.title,
        url: f.url || null,
        publisher: f.publisher || null,
        published_at: f.published_at || null,
        label: f.label || null,
        entity: f.entity || null,
        comment: f.comment,
        activity_date: f.activity_date || null,
        activity_date_end: f.activity_date_end || null,
        featured: f.featured,
      });
      onSaved(nm);
    }, "출처 정보를 저장했습니다");
  return (
    <div className="stack">
      <div className="grid cols-2">
        <Field label="자료 제목" required impact="material.title">
          {(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}
        </Field>
        <Field label="카드 라벨" help="예: 경쟁X · 팝업 연계" impact="material.label">
          {(id, d) => <input id={id} aria-describedby={d} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />}
        </Field>
        <Field label="원문 URL" impact="material.url" help={m.source.url ? <a href={m.source.url} target="_blank" rel="noreferrer">원문 새 창으로 열기 ↗</a> : "http 또는 https 주소"}>
          {(id, d) => <input id={id} aria-describedby={d} type="url" inputMode="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" />}
        </Field>
        <Field label="발행처" impact="material.publisher">
          {(id) => <input id={id} value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value })} />}
        </Field>
        <Field label="발행일" impact="material.published">
          {(id, d) => <input id={id} aria-describedby={d} type="date" value={f.published_at} onChange={(e) => setF({ ...f, published_at: e.target.value })} />}
        </Field>
        <Field label="대상 브랜드" impact="material.entity">
          {(id) => (
            <select id={id} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>
              <option value="">선택 안 함</option>
              {entities.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="활동 시작일" impact="material.activity">
          {(id) => <input id={id} type="date" value={f.activity_date} onChange={(e) => setF({ ...f, activity_date: e.target.value })} />}
        </Field>
        <Field label="활동 종료일" impact="material.activity">
          {(id) => <input id={id} type="date" value={f.activity_date_end} onChange={(e) => setF({ ...f, activity_date_end: e.target.value })} />}
        </Field>
      </div>
      <Field label="기획자 코멘트 · 사용 의도" impact="material.comment">
        {(id, d) => <textarea id={id} aria-describedby={d} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />}
      </Field>
      {m.section_id === "campaign" && (
        <Field label="딥다이브" impact="material.featured">
          {() => (
            <label className="check">
              <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />
              카드 그리드 대신 이 사례만 큰 사진으로 한 장 따로 보여주기
            </label>
          )}
        </Field>
      )}
      {(m.source.url || m.source.published_at) && <p className="small muted">원문 URL이나 발행일을 바꾸면, 이미 채택한 근거 문장은 ‘재검토 필요’로 바뀝니다.</p>}
      <ErrorBox error={action.error} />
      <div className="row">
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={action.busy || !dirty}>
          출처 정보 저장
        </button>
      </div>
    </div>
  );
}

function ImagesPanel({ m, action, refresh }: { m: Material; action: ActionT; refresh: () => Promise<void> }) {
  const [cropping, setCropping] = useState<string | null>(null);
  const upload = (file: File) =>
    action.run(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", m.title);
      await api.post(`/materials/${m.id}/assets`, fd);
      await refresh();
    }, "이미지를 올렸습니다");
  const patch = (a: Asset, body: object, msg: string) =>
    action.run(async () => {
      await api.patch(`/assets/${a.id}`, body);
      await refresh();
    }, msg);
  const select = (a: Asset) =>
    action.run(async () => {
      await api.post(`/materials/${m.id}/select-asset`, { asset_id: a.id });
      await refresh();
    }, "장표에 쓸 이미지로 선택했습니다");
  return (
    <div className="stack">
      <div className="row wrap">
        <div className="grow" data-impact="material.image">
          <p className="small muted">PNG·JPEG·WebP, 10MB 이하. 원문 캡처가 안 되면 화면 캡처를 올려 주세요.</p>
          <WhereLine k="material.image" />
        </div>
        {m.source.url && (
          <button
            type="button"
            className={`btn sm ${m.assets.length === 0 ? "primary" : ""}`}
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                const r = await api.post<{ assets: unknown[] }>(`/materials/${m.id}/fetch-source`);
                await refresh();
                return r;
              }, (r) => `원문에서 이미지 후보를 가져왔습니다 (${r.assets.length}개)`)
            }
          >
            원문에서 가져오기
          </button>
        )}
        <FileButton label="이미지 올리기" primary={false} accept="image/png,image/jpeg,image/webp" onFile={upload} disabled={action.busy} />
      </div>
      {m.assets.length === 0 && <p className="empty">아직 이미지가 없습니다.</p>}
      {m.assets.map((a, i) => {
        const chosen = m.selected_asset_id === a.id;
        return (
          <article key={a.id} className="sub stack" aria-label={`이미지 ${i + 1}`} data-impact="material.image">
            <div className="row top wrap">
              <div style={{ width: 240, height: 135, background: "#e9ecf1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, overflow: "hidden" }}>
                <CroppedImage asset={a} label={`이미지 ${i + 1}: 장표에 들어갈 영역`} />
              </div>
              <div className="grow stack" style={{ gap: 8 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <strong>이미지 {i + 1}</strong>
                  {chosen && <span className="badge b-brand">✓ 장표에 사용</span>}
                  <Status value={a.review_status} />
                  <span className="small muted num">
                    {a.width}×{a.height}px · 자르기 {a.crop_history.length}회
                  </span>
                </div>
                <div className="btn-group">
                  {!chosen && (
                    <button className="btn sm" onClick={() => select(a)}>
                      장표에 사용
                    </button>
                  )}
                  {a.review_status !== "accepted" && (
                    <button className="btn sm ok" onClick={() => patch(a, { review_status: "accepted" }, "이미지를 채택했습니다")}>
                      이미지 채택
                    </button>
                  )}
                  <button className="btn sm" aria-expanded={cropping === a.id} onClick={() => setCropping(cropping === a.id ? null : a.id)}>
                    {cropping === a.id ? "자르기 닫기" : "영역 자르기"}
                  </button>
                  {a.review_status !== "excluded" && (
                    <button className="btn sm danger" onClick={() => patch(a, { review_status: "excluded" }, "이미지를 제외했습니다")}>
                      제외
                    </button>
                  )}
                </div>
                <label className="field" style={{ maxWidth: 260 }} data-impact="material.usage">
                  <span className="label">사용 근거</span>
                  <select value={a.usage_basis} onChange={(e) => patch(a, { usage_basis: e.target.value }, "사용 근거를 바꿨습니다")}>
                    <option value="user_provided">사용자 제공</option>
                    <option value="source_reference">원문 참고 인용</option>
                    <option value="licensed">사용 허가 확보</option>
                  </select>
                </label>
              </div>
            </div>
            {cropping === a.id && (
              <div data-impact="material.crop">
              <CropTool
                asset={a}
                busy={action.busy}
                onSave={(crop) =>
                  action.run(async () => {
                    await api.patch(`/assets/${a.id}/crop`, { base_version: a.version, crop });
                    setCropping(null);
                    await refresh();
                  }, "자른 영역을 새 버전으로 저장했습니다")
                }
              />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function FactsPanel({ m, action, refresh }: { m: Material; action: ActionT; refresh: () => Promise<void> }) {
  const { project } = useProject();
  const [f, setF] = useState({ metric: "views", label: "조회", value: "", measured_at: new Date().toISOString().slice(0, 10) });
  const [correcting, setCorrecting] = useState<FactOut | null>(null);
  const add = () =>
    action.run(async () => {
      await api.post(`/materials/${m.id}/facts`, f);
      setF({ ...f, value: "" });
      await refresh();
    }, "수치를 추가했습니다. 원문과 대조해 확인하세요");
  const review = (id: string, body: object, msg: string) =>
    action.run(async () => {
      await api.patch(`/facts/${id}/review?project_id=${project?.id}`, body);
      await refresh();
    }, msg);
  const valid = /^\d+(\.\d+)?$/.test(f.value);
  return (
    <div className="stack">
      <p className="small muted">장표의 숫자는 모두 여기 등록한 수치에서 나옵니다. 원문과 대조해 확인하기 전에는 장표에 쓰이지 않고, 값을 고치면 새 버전으로 기록됩니다.</p>
      <fieldset className="sub" style={{ margin: 0 }} data-impact="material.fact">
        <legend className="strong" style={{ float: "left", padding: 0, marginBottom: 8 }}>
          수치 추가 <WhereLine k="material.fact" />
        </legend>
        <div className="grid cols-4" style={{ clear: "both" }}>
          <Field label="지표">
            {(id) => (
              <select id={id} value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value, label: METRIC_LABEL[e.target.value] ?? "" })}>
                {Object.entries(METRIC_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="장표 표시 이름">
            {(id) => <input id={id} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />}
          </Field>
          <Field label="값" help="쉼표 없이 숫자만" error={f.value && !valid ? "숫자만 입력하세요" : undefined}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={Boolean(f.value && !valid) || undefined} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replaceAll(",", "") })} />}
          </Field>
          <Field label="측정일">
            {(id) => <input id={id} type="date" value={f.measured_at} onChange={(e) => setF({ ...f, measured_at: e.target.value })} />}
          </Field>
        </div>
        <div className="row mt12">
          <span className="grow" />
          <button className="btn primary sm" onClick={add} disabled={!valid || action.busy}>
            수치 추가
          </button>
        </div>
      </fieldset>
      {m.facts.length > 0 && (
        <ul className="list">
          {m.facts.map((x) => (
            <li key={x.id}>
              <div className="grow">
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="title">{x.label ?? x.metric}</span>
                  <mark className="parts">
                    <span className="fact num">{x.display}</span>
                  </mark>
                  <Status value={x.verification_status} />
                </div>
                <div className="meta">
                  측정 {fmtDate(x.measured_at)}
                  {x.review_note ? ` · 메모: ${x.review_note}` : ""}
                </div>
              </div>
              <div className="actions">
                {x.verification_status === "candidate" && (
                  <button className="btn sm ok" onClick={() => review(x.id, { action: "confirm" }, "원문과 일치함으로 확인했습니다")}>
                    원문과 일치 확인
                  </button>
                )}
                <button className="btn sm" onClick={() => setCorrecting(x)}>
                  값 고치기
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {correcting && <CorrectFact fact={correcting} onClose={() => setCorrecting(null)} onSubmit={(value, note) => review(correcting.id, { action: "correct", value, note }, "새 값으로 고쳤습니다. 이 수치를 쓴 문장은 다시 검토하세요").then(() => setCorrecting(null))} />}
    </div>
  );
}

function CorrectFact({ fact, onClose, onSubmit }: { fact: FactOut; onClose: () => void; onSubmit: (value: string, note: string) => void }) {
  const [value, setValue] = useState(fact.value ?? "");
  const [note, setNote] = useState("");
  const ok = /^\d+(\.\d+)?$/.test(value) && note.trim().length >= 2;
  return (
    <Dialog
      variant="center"
      title={`${fact.label ?? fact.metric} 값 고치기`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={!ok} onClick={() => onSubmit(value, note.trim())}>
            새 값 저장
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">기존 값 {fact.display}은 이력으로 남고, 이 수치를 쓴 근거 문장은 ‘재검토 필요’가 됩니다.</p>
        <Field label="새 값" required>
          {(id) => <input id={id} data-autofocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replaceAll(",", ""))} />}
        </Field>
        <Field label="고친 이유" required>
          {(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 원문 재확인 결과 116,800" />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ claims */

const CHIP = /⟦([^⟧]+)⟧/g;
// A written-out date needs no Fact behind it — only a claimed number/figure does.
// Mirrors the server's DATE_LIKE exemption so the preview and the save-time check agree.
const DATE_LIKE = /\d{4}[.\-/]\d{1,2}(?:[.\-/]\d{1,2})?|\d{4}년\s?\d{1,2}월(?:\s?\d{1,2}일)?|\d{1,2}월\s?\d{1,2}일/g;

/** Readable composer text -> server token syntax. ⟦label display⟧ -> {{F-id}}; plain dates need no token. */
function toServerText(text: string, facts: FactOut[]) {
  return text.replace(CHIP, (whole, inner: string) => {
    const f = facts.find((x) => chipText(x) === inner);
    return f ? `{{${f.id}}}` : whole;
  });
}
const chipText = (f: FactOut) => `${f.label ?? f.metric} ${f.display}`;

/** Local preview: chips highlighted, [[names]] kept, written-out dates recognized, bare digits flagged before saving. */
function previewParts(text: string) {
  const out: { kind: "text" | "fact" | "name" | "date" | "bad"; text: string }[] = [];
  const re = /⟦([^⟧]+)⟧|\[\[(.+?)\]\]/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  const pushText = (t: string) => {
    let last = 0;
    let dm: RegExpExecArray | null;
    DATE_LIKE.lastIndex = 0;
    while ((dm = DATE_LIKE.exec(t))) {
      if (dm.index > last) t.slice(last, dm.index).split(/(\d[\d,.]*)/).forEach((s, i) => s && out.push({ kind: i % 2 ? "bad" : "text", text: s }));
      out.push({ kind: "date", text: dm[0] });
      last = dm.index + dm[0].length;
    }
    if (last < t.length) t.slice(last).split(/(\d[\d,.]*)/).forEach((s, i) => s && out.push({ kind: i % 2 ? "bad" : "text", text: s }));
  };
  while ((m = re.exec(text))) {
    if (m.index > pos) pushText(text.slice(pos, m.index));
    if (m[1]) out.push({ kind: "fact", text: m[1].split(" ").slice(1).join(" ") });
    else out.push({ kind: "name", text: m[2] });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) pushText(text.slice(pos));
  return out;
}

function ClaimsPanel({ m, action, refresh }: { m: Material; action: ActionT; refresh: () => Promise<void> }) {
  const [kind, setKind] = useState<Claim["kind"]>("fact");
  const zone = useImpactZone();
  useEffect(() => zone.set(`claim.${kind}`), [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const usable = m.facts.filter((f) => f.verification_status === "eligible");
  const preview = useMemo(() => previewParts(text), [text]);
  const bad = preview.filter((p) => p.kind === "bad");

  const insert = (chip: string) => {
    const el = inputRef.current;
    const at = el?.selectionStart ?? text.length;
    const before = text.slice(0, at);
    const sep = before && !before.endsWith(" ") ? " " : "";
    const next = `${before}${sep}${chip} ${text.slice(at)}`;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      const p = (before + sep + chip + " ").length;
      el?.setSelectionRange(p, p);
    });
  };
  const add = () =>
    action.run(async () => {
      await api.post(`/materials/${m.id}/claims`, { kind, text: toServerText(text, usable) });
      setText("");
      await refresh();
    }, "문장을 추가했습니다. 검토 후 채택하세요");
  const patch = (c: Claim, body: object, msg: string) =>
    action.run(async () => {
      await api.patch(`/claims/${c.id}`, { base_version: c.version, ...body });
      await refresh();
    }, msg);

  return (
    <div className="stack">
      <fieldset className="sub stack" style={{ margin: 0 }} data-impact={`claim.${kind}`}>
        <legend className="strong" style={{ float: "left", padding: 0 }}>
          문장 쓰기
        </legend>
        <div role="radiogroup" aria-label="문장 종류" className="seg" style={{ clear: "both", width: "fit-content" }}>
          {(["fact", "interpretation", "recommendation"] as const).map((k) => (
            <label key={k}>
              <input type="radio" name="claim-kind" checked={kind === k} onChange={() => setKind(k)} />
              {KIND_LABEL[k][0]}
            </label>
          ))}
        </div>
        <p className="small muted">
          {KIND_LABEL[kind][2]}. 명사형으로 짧게 쓰세요. <WhereLine k={`claim.${kind}`} />
        </p>
        <Field label="문장" help="날짜는 2026.03.15처럼 그냥 쓰면 됩니다. 수치는 아래 칩으로 넣으세요 — 직접 친 숫자는 근거가 없어 채택할 수 없습니다. 숫자가 든 이름은 [[제품명 3]]처럼 감싸세요.">
          {(id, d) => <textarea id={id} ref={inputRef} aria-describedby={d} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 2026.03.15 신제품 공개 직후 같은 비주얼로 팝업 운영" />}
        </Field>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small strong">수치 넣기</span>
          {usable.length === 0 && <span className="small muted">확인된 수치가 없습니다 — ‘3 성과 수치’ 탭에서 추가·확인하세요</span>}
          {usable.map((f) => (
            <button key={f.id} className="chip" onClick={() => insert(`⟦${chipText(f)}⟧`)}>
              + {chipText(f)}
            </button>
          ))}
        </div>
        {text.trim() && (
          <div>
            <div className="small strong">미리보기</div>
            <div className="preview-line parts mt4" aria-live="polite">
              {preview.map((p, i) =>
                p.kind === "fact" ? (
                  <mark key={i} className="fact">
                    {p.text}
                  </mark>
                ) : p.kind === "bad" ? (
                  <mark key={i} style={{ background: "var(--bad-soft)", color: "var(--bad)", fontWeight: 700 }}>
                    {p.text}
                  </mark>
                ) : (
                  <span key={i} className={p.kind === "name" ? "name" : p.kind === "date" ? "date" : undefined}>
                    {p.text}
                  </span>
                ),
              )}
            </div>
            {bad.length > 0 && <p className="small mt4" style={{ color: "var(--bad)", fontWeight: 600 }}>근거 없는 숫자 {bad.map((b) => `‘${b.text}’`).join(", ")} — 수치 칩으로 바꾸거나 [[ ]]로 이름임을 표시하세요.</p>}
          </div>
        )}
        <div className="row">
          <span className="grow" />
          <button className="btn primary sm" onClick={add} disabled={!text.trim() || action.busy}>
            문장 추가
          </button>
        </div>
      </fieldset>

      {m.claims.length === 0 ? (
        <p className="empty">아직 문장이 없습니다.</p>
      ) : (
        <ul className="list">
          {m.claims.map((c) => (
            <li key={c.id} className={c.review_status === "excluded" ? "dim" : ""} data-impact={`claim.${c.kind}`}>
              <Kind kind={c.kind} author={c.author} />
              <div className="grow">
                <Parts parts={c.parts} />
                {c.issues.map((i) => (
                  <div key={i} className="small" style={{ color: "var(--bad)", fontWeight: 600 }}>
                    {i} — 채택할 수 없습니다
                  </div>
                ))}
                {c.stale_reason && <div className="small" style={{ color: "var(--warn)", fontWeight: 600 }}>{c.stale_reason}</div>}
                {c.quote && (
                  <details className="small mt4">
                    <summary style={{ cursor: "pointer", color: "var(--brand-text)", fontWeight: 600 }}>원문 인용 보기</summary>
                    <blockquote style={{ margin: "6px 0 0", paddingLeft: 10, borderLeft: "3px solid var(--line-2)", color: "var(--text-2)" }}>{c.quote}</blockquote>
                  </details>
                )}
              </div>
              <div className="actions">
                <Status value={c.review_status} />
                {c.review_status !== "accepted" && (
                  <button className="btn sm ok" disabled={c.issues.length > 0} onClick={() => patch(c, { review_status: "accepted" }, "문장을 채택했습니다")}>
                    채택
                  </button>
                )}
                {c.review_status !== "excluded" && (
                  <button className="btn sm ghost" onClick={() => patch(c, { review_status: "excluded" }, "문장을 제외했습니다")}>
                    제외
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {m.claims.some((c) => c.review_status === "stale") && <Notice tone="warn">근거가 바뀐 문장이 있습니다. 내용을 확인한 뒤 다시 채택하세요.</Notice>}
    </div>
  );
}
