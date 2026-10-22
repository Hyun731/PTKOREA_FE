"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import type { Brand, Meta, ProjectConfig } from "@/lib/api";

export type ProjectDraft = Pick<ProjectConfig, "name" | "client" | "period" | "brands" | "enabled_slides" | "collection_cutoff" | "target_hypothesis">;

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function emptyBrand(i: number): Brand {
  return { id: `B${i + 1}`, name: "", aliases: [], categories: [], target: { age_min: null, age_max: null, gender: "all", label: "" }, competitors: [], benchmarks: [], keyword_groups: [] };
}

// What each slide shows, in one line (selection tiles).
const TEMPLATE_DESC: Record<string, string> = {
  "2-8a": "브랜드명 검색 점유 막대 — 보유한 검색 지수 CSV가 있을 때만",
  "2-8b": "월별 검색 지수 선 그래프 — 보유한 검색 지수 CSV가 있을 때만",
  "2-8c": "‘브랜드+카테고리’ 검색어 점유 — 보유한 검색 지수 CSV가 있을 때만",
  "2-8d": "키 타겟 검색 점유 표 — 보유한 검색 지수 CSV가 있을 때만",
  "3-1": "크리에이터 게시물 조회·반응률 표",
  C1: "이미지·성과·시사점이 있는 사례 카드 2~4열 (한눈에 보기)",
  C2: "사례 하나를 한 장에 — 큰 이미지·성과 요약·진행 방식·원문 발췌",
  M1: "시장·타겟 공식 자료 요약 표",
  "5-recap": "본문 발견을 3개 주제로 요약 (주로 검색 장표의 발견에서 나옴)",
  "A-source": "사용한 자료의 출처·링크 표",
  cover: "고객사·프로젝트 이름, 작성 월",
  index: "실제로 들어간 섹션 목록",
  divider: "섹션 시작 검은 장표",
  end: "마지막 E.O.D 장표",
};
const FRAME_LABEL: Record<string, string> = { cover: "표지", index: "목차(INDEX)", divider: "섹션 구분", end: "마무리" };

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

function BrandEditor({ brand, onChange, onRemove, index }: { brand: Brand; onChange: (b: Brand) => void; onRemove?: () => void; index: number }) {
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
          <Field row label="별칭" help="쉼표로 구분" impact="brand.aliases">
            {(id, d) => <ListInput id={id} describedBy={d} value={brand.aliases} onChange={(v) => onChange({ ...brand, aliases: v })} />}
          </Field>
          <Field row label="벤치마크 브랜드" help="쉼표로 구분" impact="brand.benchmarks">
            {(id, d) => <ListInput id={id} describedBy={d} value={brand.benchmarks} onChange={(v) => onChange({ ...brand, benchmarks: v })} />}
          </Field>
        </div>
      </details>
    </section>
  );
}

export function ProjectForm({ value, onChange, meta }: { value: ProjectDraft; onChange: (v: ProjectDraft) => void; meta: Meta | null }) {
  const toggle = (t: string) => {
    const has = value.enabled_slides.includes(t);
    onChange({ ...value, enabled_slides: has ? value.enabled_slides.filter((x) => x !== t) : [...value.enabled_slides, t] });
  };
  const templates = (meta?.sections ?? []).flatMap((s) => s.templates.map((t) => ({ t, section: s.label })));
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
          onChange={(nb) => onChange({ ...value, brands: value.brands.map((x, j) => (j === i ? nb : x)) })}
          onRemove={value.brands.length > 1 ? () => onChange({ ...value, brands: value.brands.filter((_, j) => j !== i) }) : undefined}
        />
      ))}
      {value.brands.length < 3 && (
        <div>
          <button className="btn" onClick={() => onChange({ ...value, brands: [...value.brands, emptyBrand(value.brands.length)] })}>
            + 자사 브랜드 추가 <span className="faint">(최대 3개)</span>
          </button>
        </div>
      )}

      <section className="card" aria-labelledby="pf-slides" data-impact="project.slides">
        <div className="card-head">
          <div className="grow">
            <h3 id="pf-slides">보고서에 넣을 장표</h3>
            <p>
              기본값으로 {value.enabled_slides.length}개 장표가 선택되어 있습니다. 보통은 그대로 두면 됩니다 — 바꾸고 싶을 때만 아래를 펼치세요.
            </p>
          </div>
        </div>
        <details className="more">
          <summary>장표 목록 펼쳐서 선택 바꾸기</summary>
          <fieldset style={{ border: 0, padding: 0, margin: "14px 0 0" }}>
            <legend className="group-title">본문 장표</legend>
            <div className="tiles mt8">
              {templates.map(({ t, section }) => (
                <label key={t} className="tile">
                  <input type="checkbox" checked={value.enabled_slides.includes(t)} onChange={() => toggle(t)} />
                  <span>
                    <span className="t-name">{meta?.template_labels[t] ?? t}</span>
                    <span className="t-desc" style={{ display: "block" }}>
                      {section} · {TEMPLATE_DESC[t]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: "18px 0 0" }}>
            <legend className="group-title">구성 장표</legend>
            <div className="tiles mt8">
              {["cover", "index", "divider", "end"].map((t) => (
                <label key={t} className="tile">
                  <input type="checkbox" checked={value.enabled_slides.includes(t)} onChange={() => toggle(t)} />
                  <span>
                    <span className="t-name">{FRAME_LABEL[t]}</span>
                    <span className="t-desc" style={{ display: "block" }}>
                      {TEMPLATE_DESC[t]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>
      </section>
    </div>
  );
}
