"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import type { Brand, Meta, ProjectConfig } from "@/lib/api";

export type ProjectDraft = Pick<ProjectConfig, "name" | "client" | "period" | "brands" | "collection_cutoff" | "target_hypothesis">;

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function emptyBrand(i: number): Brand {
  return { id: `B${i + 1}`, name: "", aliases: [], categories: [], target: { age_min: null, age_max: null, gender: "all", label: "" }, competitors: [], benchmarks: [], keyword_groups: [] };
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
      <div>
        <button className="btn" onClick={() => onChange({ ...value, brands: [...value.brands, emptyBrand(value.brands.length)] })}>
          + 자사 브랜드 추가
        </button>
      </div>

    </div>
  );
}
