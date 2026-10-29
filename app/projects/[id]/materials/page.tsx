"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CroppedImage } from "@/components/crop";
import { ImpactPanel, ImpactZone } from "@/components/impact";
import { MaterialStudio } from "@/components/material-studio";
import { useProject } from "@/components/project-context";
import { Dialog, ErrorBox, Field, FileButton, PageIntro, Status, fmtDate } from "@/components/ui";
import { api, type Batch, type Material, type ProjectConfig, type ResearchPlan } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

function CsvSection({ pid, onChanged }: { pid: string; onChanged: () => void }) {
  const { data: batches, reload } = useApi<Batch[]>(`/projects/${pid}/imports`);
  const action = useAction();
  const [kind, setKind] = useState<"facts" | "posts">("facts");
  const after = async () => {
    await reload();
    onChanged();
  };
  const upload = (file: File) =>
    action.run(async () => {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      await api.post(`/projects/${pid}/imports`, fd);
      await after();
    }, "CSV를 올렸습니다. 검토·시사점 탭에서 채택하세요");
  const sample = (posts: string) =>
    action.run(async () => {
      await api.post(`/projects/${pid}/imports/sample?posts=${posts}`);
      await after();
    }, "합성 샘플 CSV를 불러왔습니다");
  const visible = (batches ?? []).filter((b) => b.status !== "replaced");
  return (
    <section className="card" aria-labelledby="csv-title">
      <div className="card-head">
        <div className="grow">
          <h2 id="csv-title">정량 데이터 (CSV)</h2>
          <p>올린 뒤 검토·시사점 탭에서 ‘채택’해야 계산에 쓰입니다.</p>
        </div>
      </div>
      <div className="row wrap">
        <div role="radiogroup" aria-label="CSV 종류" className="seg">
          <label>
            <input type="radio" name="csv-kind" checked={kind === "facts"} onChange={() => setKind("facts")} />
            검색 지수 facts.csv
          </label>
          <label>
            <input type="radio" name="csv-kind" checked={kind === "posts"} onChange={() => setKind("posts")} />
            게시물 posts.csv
          </label>
        </div>
        <FileButton label="CSV 파일 선택" accept=".csv,text/csv" onFile={upload} disabled={action.busy} />
        <span className="grow" />
        <button className="btn ghost" onClick={() => sample("posts.csv")} disabled={action.busy}>
          합성 샘플 불러오기
        </button>
      </div>
      <ErrorBox error={action.error} />
      {visible.length > 0 && (
        <ul className="list mt16">
          {visible.map((b) => (
            <li key={b.id}>
              <div className="grow">
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="title">{b.filename}</span>
                  <Status value={b.status} />
                  {b.synthetic && <span className="badge b-bad">합성 데이터</span>}
                </div>
                <div className="meta num">
                  유효 {b.valid_rows}/{b.total_rows}행{b.errors.length ? ` · 오류 ${b.errors.length}행` : ""} · {fmtDate(b.created_at)}
                </div>
              </div>
              {b.status === "candidate" && (
                <Link href={`/projects/${pid}/review`} className="btn sm">
                  채택하러 가기
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="more">
        <summary>표 분할 확인용 13행 샘플</summary>
        <p className="small muted mt8">인플루언서 표가 두 장으로 나뉘는지 확인하는 테스트 자료입니다.</p>
        <button className="btn sm mt8" onClick={() => sample("posts_13.csv")} disabled={action.busy}>
          13행 게시물 샘플 불러오기
        </button>
      </details>
    </section>
  );
}

function NewMaterialDialog({ pid, itemId, onClose, onCreated }: { pid: string; itemId: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { project } = useProject();
  const { data: plan } = useApi<ResearchPlan>(`/projects/${pid}/research-plan`);
  const item = plan?.items.find((i) => i.id === itemId) ?? null;
  const brands = project?.config.brands ?? [];
  const [f, setF] = useState(() => ({ title: "", url: "", publisher: "", published_at: "", brand_id: brands[0]?.id ?? "", entity: "", section_id: "campaign", label: "", comment: "" }));
  const [seeded, setSeeded] = useState(false);
  if (item && !seeded) {
    setSeeded(true);
    setF((x) => ({ ...x, brand_id: item.brand_id, entity: item.entity, section_id: ["campaign", "market", "influencer"].includes(item.section_id) ? item.section_id : "campaign" }));
  }
  const action = useAction();
  const brand = brands.find((b) => b.id === f.brand_id);
  const entities = brand ? [...new Set([brand.name, ...brand.competitors, ...brand.benchmarks])] : [];
  const urlBad = f.url !== "" && !/^https?:\/\/.+/.test(f.url);
  const create = () =>
    action.run(async () => {
      const m = await api.post<Material>(`/projects/${pid}/materials`, {
        ...f,
        url: f.url || null,
        publisher: f.publisher || null,
        published_at: f.published_at || null,
        activity_date: f.published_at || null,
        label: f.label || (f.entity ? `${f.entity} · ${f.title}` : null),
        entity: f.entity || null,
        brand_id: f.brand_id || null,
        research_item_id: item?.id ?? null,
      });
      onCreated(m.id);
    }, "자료 카드를 만들었습니다. 이어서 이미지와 근거를 넣으세요");
  return (
    <Dialog
      title="자료 카드 추가"
      subtitle={item ? `조사 항목에 연결: ${item.question}` : "기사·게시물·보고서 하나당 카드 하나"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" onClick={create} disabled={!f.title.trim() || urlBad || action.busy}>
            카드 만들고 이어서 입력
          </button>
        </>
      }
    >
      <ImpactZone initial="material.title">
      <div className="with-impact">
      <div className="stack">
        <ErrorBox error={action.error} />
        <div className="grid cols-2">
          <Field label="자료 제목" required className="span-2" impact="material.title">
            {(id) => <input id={id} data-autofocus aria-required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="예: 경쟁X 성수 팝업" />}
          </Field>
          <Field label="원문 URL" help="없으면 비워 두고 캡처 이미지를 올리세요" error={urlBad ? "http:// 또는 https://로 시작해야 합니다" : undefined} className="span-2" impact="material.url">
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={urlBad || undefined} type="url" inputMode="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" />}
          </Field>
        </div>
        <details className="more">
          <summary>발행처·브랜드·장표 등 더 입력하기 (나중에 바꿔도 됩니다)</summary>
          <div className="grid cols-2 mt8">
            <Field label="발행처" impact="material.publisher">
              {(id) => <input id={id} value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value })} />}
            </Field>
            <Field label="발행일" impact="material.published">
              {(id, d) => <input id={id} aria-describedby={d} type="date" value={f.published_at} onChange={(e) => setF({ ...f, published_at: e.target.value })} />}
            </Field>
            <Field label="어느 브랜드 보고서에" impact="brand.name">
              {(id) => (
                <select id={id} value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value, entity: "" })}>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="누구의 활동인가요" impact="material.entity">
              {(id) => (
                <select id={id} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>
                  <option value="">선택 안 함</option>
                  {entities.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="쓸 장표" className="span-2" impact="material.section">
              {(id) => (
                <select id={id} value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })}>
                  <option value="campaign">캠페인 사례 카드 (C1)</option>
                  <option value="market">시장·타겟 근거 (M1)</option>
                  <option value="influencer">인플루언서 장표의 레퍼런스 이미지 (3-1)</option>
                </select>
              )}
            </Field>
            <Field label="코멘트 · 사용 의도 (선택)" help="예: 이 표현 방식을 참고" className="span-2" impact="material.comment">
              {(id, d) => <input id={id} aria-describedby={d} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />}
            </Field>
          </div>
        </details>
      </div>
      <ImpactPanel />
      </div>
      </ImpactZone>
    </Dialog>
  );
}

function MaterialGrid({ cards, brandName, onOpen }: { cards: Material[]; brandName: (id: string | null | undefined) => string; onOpen: (id: string) => void }) {
  return (
    <ul className="mgrid mt8" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {cards.map((m) => {
        const asset = m.assets.find((a) => a.id === m.selected_asset_id);
        const acceptedClaims = m.claims.filter((c) => c.review_status === "accepted").length;
        return (
          <li key={m.id}>
            <button className={`mcard ${m.review_status}`} onClick={() => onOpen(m.id)} aria-label={`${m.title} 자료 열기, ${m.review_status === "accepted" ? "채택됨" : m.review_status === "excluded" ? "제외됨" : "검토 전"}`}>
              <div className="thumb">
                {asset ? <CroppedImage asset={asset} /> : <span aria-hidden>이미지 없음</span>}
                {m.review_status === "accepted" && (
                  <span className="accepted-mark" aria-hidden>
                    ✓
                  </span>
                )}
              </div>
              <div className="body">
                <div className="row top" style={{ gap: 8 }}>
                  <span className="title grow">{m.title}</span>
                  <Status value={m.review_status} />
                </div>
                <div className="meta">
                  {m.source.publisher ?? brandName(m.brand_id)} · {fmtDate(m.activity_date ?? m.source.published_at)}
                </div>
                {m.summary && <div className="summary">{m.summary}</div>}
                <div className="meta num">
                  이미지 {m.assets.length} · 수치 {m.facts.length} · 채택 문장 {acceptedClaims}/{m.claims.length}
                </div>
                {m.duplicates.length > 0 && <div className="meta">같은 사례 출처 {m.duplicates.length}곳 더 · {m.duplicates.map((d) => d.publisher).filter(Boolean).slice(0, 2).join(", ")}</div>}
                {m.comment && <div className="meta">“{m.comment}”</div>}
                {m.review_status === "candidate" && m.review_reason && <div className="need">확인 필요: {m.review_reason}</div>}
                {m.review_status === "accepted" && m.readiness.length > 0 && <div className="need">남은 일: {m.readiness.join(", ")}</div>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Cards made before the 3C plan (or by hand) find their item from their section and who they are about.
function scopeOf(m: Material, cfg: ProjectConfig): string {
  if (m.scope_id) return m.scope_id;
  if (m.section_id === "influencer") return "2-7";
  if (m.section_id === "market") return "3-1";
  if (cfg.brands.some((b) => m.entity && b.competitors.includes(m.entity))) return "3-7";
  if (cfg.brands.some((b) => m.entity && b.benchmarks.includes(m.entity))) return "3-9";
  return "2-8";
}

function MaterialsInner() {
  const { project, meta, brandName, reload: reloadProject } = useProject();
  const params = useSearchParams();
  const router = useRouter();
  const pid = project?.id ?? null;
  const itemId = params.get("item");
  const { data: materials, reload } = useApi<Material[]>(pid ? `/projects/${pid}/materials` : null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(Boolean(itemId));
  const dedupe = useAction();
  // Extra sources of the same activity live inside their primary card, not as cards of their own.
  const cards = useMemo(() => (materials ?? []).filter((m) => !m.duplicate_of), [materials]);
  const live = cards.filter((m) => m.review_status !== "excluded");
  const excluded = cards.filter((m) => m.review_status === "excluded");
  const grouped = (materials ?? []).length - cards.length;
  if (!pid || !project || !meta) return <p className="muted">불러오는 중…</p>;
  const changed = () => {
    void reload();
    void reloadProject();
  };
  const findSame = () =>
    dedupe.run(
      async () => {
        const r = await api.post<{ merged: unknown[] }>(`/projects/${pid}/materials/dedupe`);
        changed();
        return r;
      },
      (r) => (r.merged.length ? `같은 사례로 보이는 카드 ${r.merged.length}개를 묶었습니다. 카드를 열어 확인·분리할 수 있습니다` : "새로 묶을 카드가 없습니다"),
    );
  const checkPeriod = () =>
    dedupe.run(
      async () => {
        const r = await api.post<{ checked: number; excluded: unknown[]; flagged: number }>(`/projects/${pid}/materials/period-check`);
        changed();
        return r;
      },
      (r) =>
        r.excluded.length || r.flagged
          ? `조사 기간 밖 자료 ${r.excluded.length}개를 제외했습니다${r.flagged ? ` · 기간 확인이 필요한 자료 ${r.flagged}개` : ""}`
          : "모든 자동 수집 자료가 조사 기간 안에 있습니다",
    );
  const acceptAll = () =>
    dedupe.run(
      async () => {
        const r = await api.post<{ accepted: number; left: number }>(`/projects/${pid}/materials/accept-all`);
        changed();
        return r;
      },
      (r) => (r.left ? `${r.accepted}개를 채택했습니다 · 관련성·기간·원문 확인이 필요한 ${r.left}개는 남겨 두었습니다` : `${r.accepted}개를 모두 채택했습니다`),
    );
  const closeAdd = () => {
    setAdding(false);
    if (itemId) router.replace(`/projects/${pid}/materials`);
  };
  const specOf = Object.fromEntries(meta.scope.items.map((sp) => [sp.id, sp]));
  const byScope: Record<string, Material[]> = {};
  for (const m of live) (byScope[scopeOf(m, project.config)] ??= []).push(m);
  const waiting = live.filter((m) => m.review_status === "candidate").length;
  const accepted = live.length - waiting;

  return (
    <div className="stack-lg">
      <PageIntro
        step="3단계"
        title="자료 확인"
        actions={
          <button className="btn" onClick={() => setAdding(true)}>
            + 자료 직접 추가
          </button>
        }
      >
        모인 자료를 자사 → 경쟁사 → 소비자 순서로 묶었습니다. 카드를 열어 요약을 읽고 채택하거나 빼세요. 다 봤다면 남은 자료를 한 번에 채택할 수 있습니다.
      </PageIntro>

      <section className="card" aria-labelledby="box-title">
        <div className="card-head">
          <div className="grow">
            <h2 id="box-title">모인 자료</h2>
            <p className="num">
              확인 전 {waiting} · 채택 {accepted}
              {grouped > 0 && ` · 같은 사례로 묶인 추가 출처 ${grouped}`}
            </p>
          </div>
          {waiting > 0 && (
            <button className="btn primary" disabled={dedupe.busy} onClick={acceptAll}>
              남은 자료 모두 채택 ({waiting})
            </button>
          )}
        </div>
        <ErrorBox error={dedupe.error} />
        {materials && live.length === 0 && (
          <div className="empty">
            <strong>아직 자료가 없습니다</strong>
            2단계 조사 계획에서 조사를 시작하거나, ‘+ 자료 직접 추가’로 기사·게시물 URL을 넣으세요.
          </div>
        )}
        {meta.scope.parts.map((part) => {
          const items = meta.scope.items.filter((sp) => sp.part === part.id && byScope[sp.id]?.length);
          if (items.length === 0) return null;
          return (
            <div key={part.id} className="mt16">
              <div className="mgroup-head">
                <span className="scope-no" aria-hidden>
                  {part.no}
                </span>
                <h3 style={{ margin: 0 }}>{part.label}</h3>
              </div>
              {items.map((sp) => {
                const list = byScope[sp.id];
                const entities = [...new Set(list.map((m) => m.entity ?? brandName(m.brand_id)))];
                return (
                  <div key={sp.id} className="mt12">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="scope-id num">{sp.id}</span>
                      <span className="title">{sp.title}</span>
                      <span className="small muted num">{list.length}건</span>
                    </div>
                    {entities.map((e) => (
                      <div key={e}>
                        {entities.length > 1 && <div className="group-title mt8">{e}</div>}
                        <MaterialGrid cards={list.filter((m) => (m.entity ?? brandName(m.brand_id)) === e)} brandName={brandName} onOpen={setOpen} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
        {Object.keys(byScope).some((k) => !specOf[k]) && (
          <div className="mt16">
            <div className="group-title">기타</div>
            <MaterialGrid cards={Object.entries(byScope).filter(([k]) => !specOf[k]).flatMap(([, v]) => v)} brandName={brandName} onOpen={setOpen} />
          </div>
        )}
        {excluded.length > 0 && (
          <details className="more">
            <summary>제외된 자료 ({excluded.length})</summary>
            <MaterialGrid cards={excluded} brandName={brandName} onOpen={setOpen} />
          </details>
        )}
        <details className="more">
          <summary>정리 도구</summary>
          <div className="row wrap mt8" style={{ gap: 8 }}>
            <span className="small muted grow">같은 활동을 다룬 기사는 카드 하나로 묶고, 조사 기간 밖 활동은 제외합니다.</span>
            <button className="btn sm" onClick={checkPeriod} disabled={dedupe.busy}>
              기간 밖 자료 정리
            </button>
            <button className="btn sm" onClick={findSame} disabled={dedupe.busy}>
              같은 사례 찾아 묶기
            </button>
          </div>
        </details>
      </section>

      <CsvSection pid={pid} onChanged={changed} />

      <div className="sticky-foot">
        <div className="row wrap">
          <span className="grow small muted">{waiting > 0 ? `확인 전 자료 ${waiting}개 — 채택한 자료만 장표에 쓰입니다.` : "모든 자료를 확인했습니다."}</span>
          <Link href={`/projects/${pid}/review`} className={`btn ${waiting === 0 ? "primary" : ""}`}>
            다음 단계: 검토·시사점 →
          </Link>
        </div>
      </div>

      {adding && <NewMaterialDialog pid={pid} itemId={itemId} onClose={closeAdd} onCreated={(id) => { closeAdd(); changed(); setOpen(id); }} />}
      {open && <MaterialStudio id={open} onClose={() => setOpen(null)} onChanged={changed} />}
    </div>
  );
}

export default function MaterialsPage() {
  return (
    <Suspense fallback={<p className="muted">불러오는 중…</p>}>
      <MaterialsInner />
    </Suspense>
  );
}
