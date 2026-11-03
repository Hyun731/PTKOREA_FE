"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import type { Brand, Meta, OfficialProfile, ProjectConfig } from "@/lib/api";

export type ProjectDraft = Pick<ProjectConfig, "name" | "client" | "period" | "brands" | "collection_cutoff" | "target_hypothesis">;

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function emptyBrand(i: number): Brand {
  return { id: `B${i + 1}`, name: "", aliases: [], categories: [], target: { age_min: null, age_max: null, gender: "all", label: "" }, competitors: [], benchmarks: [], keyword_groups: [], industry: null, official_profiles: [], competitor_profiles: {} };
}

function ListInput({ id, describedBy, value, onChange, max, placeholder }: { id: string; describedBy?: string; value: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  const items = split(text);
  const over = max !== undefined && items.length > max;
  return (
    <>
      <input id={id} aria-describedby={describedBy} aria-invalid={over || undefined} value={text} placeholder={placeholder} onChange={(e) => {
        // Commit as you type: a submit button gated on this list must not wait for a blur.
        setText(e.target.value);
        onChange(split(e.target.value));
      }} />
      {over && <span className="err">최대 {max}개까지 입력할 수 있습니다</span>}
      {items.length > 0 && (
        <div className="btn-group" aria-hidden>
          {items.map((x) => (
            <span key={x} className="badge b-outline">
              {x}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

// Articles often name a brand only one way (Matin Kim, 샘소나이트). Search results that use another
// spelling than the one typed above would be dropped, so each name carries its other spellings.
function AliasRows({ brand, onChange }: { brand: Brand; onChange: (b: Brand) => void }) {
  const names = [...new Set([brand.name, ...brand.competitors, ...brand.benchmarks].filter(Boolean))];
  if (names.length === 0) return null;
  const ent = brand.entity_aliases ?? {};
  const own = (n: string) => (n === brand.name ? [...new Set([...brand.aliases, ...(ent[n] ?? [])])] : ent[n] ?? []);
  const set = (n: string, v: string[]) => {
    if (n === brand.name) onChange({ ...brand, aliases: v, entity_aliases: { ...ent, [n]: [] } });
    else onChange({ ...brand, entity_aliases: { ...ent, [n]: v } });
  };
  return (
    <div className="mt8">
      <p className="small muted">다른 표기 (영문명 등) — 비워 두면 저장할 때 AI가 채웁니다. 기사에서 이 이름으로 불려도 같은 브랜드로 봅니다.</p>
      <div className="frows mt8">
        {names.map((n) => (
          <Field key={n} row label={n} help="쉼표로 구분" impact="brand.aliases">
            {(id, d) => <ListInput key={`${n}:${own(n).join(",")}`} id={id} describedBy={d} value={own(n)} onChange={(v) => set(n, v)} placeholder={n in ent ? "다른 표기 없음" : "저장하면 AI가 채웁니다"} />}
          </Field>
        ))}
      </div>
    </div>
  );
}

// 공식 계정 한 채널 한 줄: 후보는 체크해 채택, 직접 입력, 또는 '운영 안 함'으로 확인.
function OfficialProfileRow({ channel, label, autoCollect, profile, onChange }: { channel: string; label: string; autoCollect: boolean; profile: OfficialProfile | undefined; onChange: (p: OfficialProfile | null) => void }) {
  const [draft, setDraft] = useState(profile?.status === "confirmed" ? profile.url : "");
  const tag = autoCollect ? null : <span className="small muted"> (자동 수집 미지원)</span>;
  if (profile?.status === "candidate")
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="small" style={{ width: 90 }}>{label}{tag}</span>
        <span className="grow small">
          AI 추천: <a href={profile.url} target="_blank" rel="noreferrer">{profile.url}</a>
        </span>
        <button type="button" className="btn sm ok" onClick={() => onChange({ ...profile, status: "confirmed" })}>
          채택
        </button>
        <button type="button" className="btn sm ghost" onClick={() => onChange({ channel, url: "", status: "none" })}>
          아님
        </button>
      </div>
    );
  if (profile?.status === "confirmed")
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="small" style={{ width: 90 }}>{label}{tag}</span>
        <input className="grow" value={profile.url} onChange={(e) => onChange({ ...profile, url: e.target.value })} />
        <button type="button" className="btn sm ghost" onClick={() => onChange(null)}>
          삭제
        </button>
      </div>
    );
  if (profile?.status === "none")
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="small muted" style={{ width: 90 }}>{label}{tag}</span>
        <span className="small muted grow">운영 안 함</span>
        <button type="button" className="btn sm ghost" onClick={() => onChange(null)}>
          되돌리기
        </button>
      </div>
    );
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="small" style={{ width: 90 }}>{label}{tag}</span>
      <input className="grow" placeholder="URL — 비워 두면 저장할 때 AI가 찾아봅니다" value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && onChange({ channel, url: draft.trim(), status: "confirmed" })} />
      <button type="button" className="btn sm ghost" onClick={() => onChange({ channel, url: "", status: "none" })}>
        운영 안 함
      </button>
    </div>
  );
}

// 자사와 경쟁사 모두의 공식 계정 — 경쟁사는 Brand가 없어 이름으로 competitor_profiles에 보관한다.
function OfficialAccountsRows({ brand, meta, onChange }: { brand: Brand; meta: Meta | null; onChange: (b: Brand) => void }) {
  const names = [brand.name, ...brand.competitors].filter(Boolean);
  const channels = meta?.official_channels ?? [];
  if (names.length === 0 || channels.length === 0) return null;
  const profilesFor = (n: string) => (n === brand.name ? brand.official_profiles ?? [] : brand.competitor_profiles?.[n] ?? []);
  const setProfilesFor = (n: string, list: OfficialProfile[]) =>
    n === brand.name ? onChange({ ...brand, official_profiles: list })
                     : onChange({ ...brand, competitor_profiles: { ...(brand.competitor_profiles ?? {}), [n]: list } });
  return (
    <div className="mt8">
      <p className="small muted">공식 계정 — 비워 두면 저장할 때 AI가 후보를 찾습니다. 후보는 체크해야 수집에 쓰입니다.</p>
      <div className="frows mt8">
        {names.map((n) => {
          const profiles = profilesFor(n);
          return (
            <Field key={n} row label={n} impact="brand.official_accounts">
              {() => (
                <div className="stack" style={{ gap: 6 }}>
                  {channels.map((c) => (
                    <OfficialProfileRow key={c.id} channel={c.id} label={c.label} autoCollect={c.auto_collect}
                      profile={profiles.find((p) => p.channel === c.id)}
                      onChange={(next) => {
                        const rest = profiles.filter((p) => p.channel !== c.id);
                        setProfilesFor(n, next ? [...rest, next] : rest);
                      }} />
                  ))}
                </div>
              )}
            </Field>
          );
        })}
      </div>
    </div>
  );
}

function BrandEditor({ brand, onChange, onRemove, index, meta }: { brand: Brand; onChange: (b: Brand) => void; onRemove?: () => void; index: number; meta: Meta | null }) {
  const t = brand.target ?? { age_min: null, age_max: null, gender: "all" as const, label: "" };
  return (
    <section className="card" aria-labelledby={`brand-${index}`}>
      <div className="card-head">
        <div className="grow">
          <h3 id={`brand-${index}`}>자사 브랜드 {index + 1}{brand.name ? ` · ${brand.name}` : ""}</h3>
          <p>이 브랜드와 경쟁사로 검색·인플루언서 장표를 만듭니다.</p>
        </div>
        {onRemove && (
          <button className="btn sm ghost" onClick={onRemove}>
            이 브랜드 삭제
          </button>
        )}
      </div>
      <div className="frows">
        <Field row label="브랜드 이름" required impact="brand.name">
          {(id, d) => <input id={id} aria-describedby={d} aria-required value={brand.name} onChange={(e) => onChange({ ...brand, name: e.target.value })} />}
        </Field>
        <Field row label="경쟁사" required help="1~4개, 쉼표로 구분" impact="brand.competitors">
          {(id, d) => <ListInput id={id} describedBy={d} value={brand.competitors} onChange={(v) => onChange({ ...brand, competitors: v })} max={4} placeholder="경쟁X, 경쟁Y" />}
        </Field>
        <Field row label="업종" help="비워 두면 저장할 때 AI가 추천합니다" impact="brand.industry">
          {(id, d) => (
            <select id={id} aria-describedby={d} value={brand.industry ?? ""} onChange={(e) => onChange({ ...brand, industry: e.target.value || null })}>
              <option value="">AI 추천 대기</option>
              {(meta?.industries ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <details className="more">
        <summary>타겟·카테고리·그 밖의 설정 (나중에 채워도 됩니다)</summary>
        <div className="frows mt8">
          <Field row label="주력 카테고리" help="쉼표로 구분" impact="brand.categories">
            {(id, d) => <ListInput id={id} describedBy={d} value={brand.categories} onChange={(v) => onChange({ ...brand, categories: v })} placeholder="러기지, 백팩" />}
          </Field>
          <Field row label="키 타겟 표시명" help="예: 35세 이상 · 전체 성별" impact="brand.targetLabel">
            {(id, d) => <input id={id} aria-describedby={d} value={t.label} onChange={(e) => onChange({ ...brand, target: { ...t, label: e.target.value } })} />}
          </Field>
          <Field row label="키 타겟 조건" help="최대 연령을 비우면 상한 없음" impact="brand.targetAge">
            {(id, d) => (
              <div className="pair" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <input id={id} aria-describedby={d} aria-label="최소 연령" type="number" inputMode="numeric" placeholder="최소 연령" value={t.age_min ?? ""} onChange={(e) => onChange({ ...brand, target: { ...t, age_min: e.target.value === "" ? null : Number(e.target.value) } })} />
                <input aria-label="최대 연령" type="number" inputMode="numeric" placeholder="최대 연령" value={t.age_max ?? ""} onChange={(e) => onChange({ ...brand, target: { ...t, age_max: e.target.value === "" ? null : Number(e.target.value) } })} />
                <select aria-label="성별" value={t.gender} onChange={(e) => onChange({ ...brand, target: { ...t, gender: e.target.value as "all" | "female" | "male" } })}>
                  <option value="all">전체 성별</option>
                  <option value="female">여성</option>
                  <option value="male">남성</option>
                </select>
              </div>
            )}
          </Field>
          <Field row label="브랜드 ID" help="영문 대문자 1~5자" impact="brand.id">
            {(id, d) => <input id={id} aria-describedby={d} value={brand.id} maxLength={5} onChange={(e) => onChange({ ...brand, id: e.target.value.toUpperCase() })} />}
          </Field>
          <Field row label="벤치마크 브랜드" help="쉼표로 구분" impact="brand.benchmarks">
            {(id, d) => <ListInput id={id} describedBy={d} value={brand.benchmarks} onChange={(v) => onChange({ ...brand, benchmarks: v })} />}
          </Field>
        </div>
        <AliasRows brand={brand} onChange={onChange} />
        <OfficialAccountsRows brand={brand} meta={meta} onChange={onChange} />
      </details>
    </section>
  );
}

export function ProjectForm({ value, onChange, meta }: { value: ProjectDraft; onChange: (v: ProjectDraft) => void; meta: Meta | null }) {
  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="pf-basic">
        <div className="card-head">
          <h3 id="pf-basic" className="grow">
            기본 정보
          </h3>
        </div>
        <div className="frows">
          <Field row label="프로젝트 이름" required impact="project.name">
            {(id, d) => <input id={id} aria-describedby={d} aria-required value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />}
          </Field>
          <Field row label="고객사" required impact="project.client">
            {(id, d) => <input id={id} aria-describedby={d} aria-required value={value.client} onChange={(e) => onChange({ ...value, client: e.target.value })} />}
          </Field>
          <Field row label="조사 기간" required impact="project.period">
            {(id, d) => (
              <div className="pair">
                <input id={id} aria-describedby={d} aria-label="조사 시작일" type="date" value={value.period.start} onChange={(e) => onChange({ ...value, period: { ...value.period, start: e.target.value } })} />
                <input aria-label="조사 종료일" type="date" value={value.period.end} onChange={(e) => onChange({ ...value, period: { ...value.period, end: e.target.value } })} />
              </div>
            )}
          </Field>
        </div>
        <details className="more">
          <summary>선택 입력 (수집 기준일 · 타겟 가설)</summary>
          <div className="frows mt8">
            <Field row label="수집 기준일" help="비워 두면 오늘 날짜 기준" impact="project.cutoff">
              {(id, d) => <input id={id} aria-describedby={d} type="date" value={value.collection_cutoff ?? ""} onChange={(e) => onChange({ ...value, collection_cutoff: e.target.value || null })} />}
            </Field>
            <Field row label="타겟 가설" help="선택 입력" impact="project.hypothesis">
              {(id, d) => <input id={id} aria-describedby={d} value={value.target_hypothesis ?? ""} onChange={(e) => onChange({ ...value, target_hypothesis: e.target.value || null })} />}
            </Field>
          </div>
        </details>
      </section>

      {value.brands.map((b, i) => (
        <BrandEditor
          key={i}
          index={i}
          brand={b}
          meta={meta}
          onChange={(nb) => onChange({ ...value, brands: value.brands.map((x, j) => (j === i ? nb : x)) })}
          onRemove={value.brands.length > 1 ? () => onChange({ ...value, brands: value.brands.filter((_, j) => j !== i) }) : undefined}
        />
      ))}
      <div>
        <button className="btn" onClick={() => onChange({ ...value, brands: [...value.brands, emptyBrand(value.brands.length)] })}>
          + 자사 브랜드 추가
        </button>
      </div>

    </div>
  );
}
