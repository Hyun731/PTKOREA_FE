"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CroppedImage } from "@/components/crop";
import { ImpactPanel, ImpactZone } from "@/components/impact";
import { MaterialDrawer } from "@/components/material-drawer";
import { SECTION_LABEL, useProject } from "@/components/project-context";
import { Dialog, ErrorBox, Field, FileButton, Notice, PageIntro, Status, fmtDate } from "@/components/ui";
import { api, type Batch, type Material, type ResearchPlan } from "@/lib/api";
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
                  {SECTION_LABEL[m.section_id]} · {m.entity ?? brandName(m.brand_id)} · {fmtDate(m.activity_date ?? m.source.published_at)}
                </div>
                <div className="meta num">
                  이미지 {m.assets.length} · 수치 {m.facts.length} · 채택 문장 {acceptedClaims}/{m.claims.length}
                </div>
                {m.duplicates.length > 0 && <div className="meta">같은 사례 출처 {m.duplicates.length}곳 더 · {m.duplicates.map((d) => d.publisher).filter(Boolean).slice(0, 2).join(", ")}</div>}
                {m.comment && <div className="meta">“{m.comment}”</div>}
                {m.readiness.length > 0 && <div className="need">남은 일: {m.readiness.join(", ")}</div>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MaterialsInner() {
  const { project, brandName, reload: reloadProject } = useProject();
  const params = useSearchParams();
  const router = useRouter();
  const pid = project?.id ?? null;
  const itemId = params.get("item");
  const [filters, setFilters] = useState({ brand_id: "", section_id: "", status: "" });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const { data: materials, reload } = useApi<Material[]>(pid ? `/projects/${pid}/materials${qs ? `?${qs}` : ""}` : null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(Boolean(itemId));
  const dedupe = useAction();
  // Extra sources of the same activity live inside their primary card, not as cards of their own.
  const cards = useMemo(() => (materials ?? []).filter((m) => !m.duplicate_of), [materials]);
  const grouped = (materials ?? []).length - cards.length;
  const counts = useMemo(() => {
    const c = { candidate: 0, accepted: 0, excluded: 0 };
    for (const m of cards) c[m.review_status]++;
    return c;
  }, [cards]);
  if (!pid || !project) return <p className="muted">불러오는 중…</p>;
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
  const closeAdd = () => {
    setAdding(false);
    if (itemId) router.replace(`/projects/${pid}/materials`);
  };

  return (
    <div className="stack-lg">
      <PageIntro
        step="3단계"
        title="자료 수집"
        actions={
          <button className="btn primary" onClick={() => setAdding(true)}>
            + 자료 카드 추가
          </button>
        }
      >
        URL·이미지로 자료 카드를 만들고, 정량 CSV를 올립니다.
      </PageIntro>

      <section className="card" aria-labelledby="box-title">
        <div className="card-head">
          <div className="grow">
            <h2 id="box-title">자료 보관함</h2>
            <p className="num">
              검토 전 {counts.candidate} · 채택 {counts.accepted} · 제외 {counts.excluded}
              {grouped > 0 && ` · 같은 사례로 묶인 추가 출처 ${grouped}`}
            </p>
          </div>
          <div className="row wrap" role="group" aria-label="자료 필터">
            <label className="sr-only" htmlFor="f-brand">
              브랜드
            </label>
            <select id="f-brand" style={{ width: "auto" }} value={filters.brand_id} onChange={(e) => setFilters({ ...filters, brand_id: e.target.value })}>
              <option value="">모든 브랜드</option>
              {project.config.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="f-sec">
              장표
            </label>
            <select id="f-sec" style={{ width: "auto" }} value={filters.section_id} onChange={(e) => setFilters({ ...filters, section_id: e.target.value })}>
              <option value="">모든 장표</option>
              {["campaign", "market", "influencer"].map((s) => (
                <option key={s} value={s}>
                  {SECTION_LABEL[s]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="f-st">
              상태
            </label>
            <select id="f-st" style={{ width: "auto" }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">모든 상태</option>
              <option value="candidate">검토 전</option>
              <option value="accepted">채택</option>
              <option value="excluded">제외</option>
            </select>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted grow">같은 활동을 다룬 기사는 카드 하나로 묶고, 조사 기간 밖 활동은 제외합니다.</span>
          <button className="btn sm" onClick={checkPeriod} disabled={dedupe.busy}>
            기간 밖 자료 정리
          </button>
          <button className="btn sm" onClick={findSame} disabled={dedupe.busy}>
            같은 사례 찾아 묶기
          </button>
        </div>
        <ErrorBox error={dedupe.error} />
        {materials && materials.length === 0 && (
          <div className="empty">
            <strong>{qs ? "조건에 맞는 자료가 없습니다" : "아직 자료가 없습니다"}</strong>
            {qs ? "필터를 바꿔 보세요." : "‘+ 자료 카드 추가’로 기사·게시물 URL과 캡처 이미지를 넣으세요. 자동 수집 자료도 이 보관함에 함께 들어옵니다."}
          </div>
        )}
        {filters.status ? (
          <MaterialGrid cards={cards} brandName={brandName} onOpen={setOpen} />
        ) : (
          <div className="stack-lg">
            {([
              ["candidate", "검토 전", counts.candidate],
              ["accepted", "채택됨", counts.accepted],
              ["excluded", "제외됨", counts.excluded],
            ] as const).map(([status, label, n]) =>
              n > 0 && (
                <div key={status}>
                  <div className="group-title mt16">{label} · {n}</div>
                  <MaterialGrid cards={cards.filter((m) => m.review_status === status)} brandName={brandName} onOpen={setOpen} />
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <CsvSection pid={pid} onChanged={changed} />

      {project.counts.materials + project.counts.batches > 0 && (
        <Notice>
          자료를 다 넣었다면 <Link href={`/projects/${pid}/review`}>4. 검토·시사점</Link>에서 채택 여부를 정하세요.
        </Notice>
      )}

      {adding && <NewMaterialDialog pid={pid} itemId={itemId} onClose={closeAdd} onCreated={(id) => { closeAdd(); changed(); setOpen(id); }} />}
      {open && <MaterialDrawer id={open} onClose={() => setOpen(null)} onChanged={changed} />}
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
