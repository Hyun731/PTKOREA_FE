"use client";

// P3-2 자료 확인 화면의 '자사 분석 / 경쟁사 비교' 탭. 새로 모으지 않고, 이미 모인 수치를 채널별로 보여 준다.
// 확인 전 값도 함께 보여 주되(판단에 필요) '확인 전' 표시를 붙인다 — 장표에는 확인한 값만 쓰인다.
import Link from "next/link";
import { useState } from "react";
import { BarChart, LineChart } from "@/components/data-chart";
import type { Tokens } from "@/components/editor/types";
import { ErrorBox } from "@/components/ui";
import type { OwnedChannel, OwnedSummary, SummaryValue } from "@/lib/api";
import { useApi } from "@/lib/hooks";

type Mode = "self" | "compare";

function Pending({ status }: { status: SummaryValue["status"] }) {
  return status === "candidate" ? <span className="badge b-warn">확인 전</span> : null;
}

function gapText(diff: number, ratio: number | null, competitor: string) {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const abs = Math.abs(diff).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return `${competitor} 대비 ${ratio != null ? `${ratio}% · ` : ""}${sign}${abs}`;
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="stat" style={{ minWidth: 0 }}>
      <div className="title">{title}</div>
      {note && <div className="small muted">{note}</div>}
      <div className="mt8">{children}</div>
    </div>
  );
}

function ChannelBlock({ ch, mode, tokens }: { ch: OwnedChannel; mode: Mode; tokens: Tokens }) {
  const kpis = ch.kpis.filter((k) => k.values.some((v) => v.role === "self") || mode === "compare");
  const series = mode === "self" ? ch.monthly_posts.series.filter((s) => s.role === "self") : ch.monthly_posts.series;
  const sentiment = mode === "self" ? ch.sentiment.filter((s) => s.role === "self") : ch.sentiment;
  return (
    <div className="mt16">
      <h3 style={{ margin: 0 }}>{ch.label}</h3>
      {kpis.length > 0 && (
        <div className="stats mt8">
          {kpis.map((k) => {
            const own = k.values.find((v) => v.role === "self");
            return (
              <div key={k.key} className="stat">
                <div className="v num">{own ? own.display : "—"}</div>
                <div className="k">
                  {k.label} {own && <Pending status={own.status} />}
                </div>
                {mode === "compare" && k.vs_competitor && (
                  <div className="small muted num mt8">{gapText(k.vs_competitor.diff, k.vs_competitor.ratio_pct, k.vs_competitor.competitor)}</div>
                )}
                {mode === "compare" && !own && <div className="small muted mt8">자사 값이 아직 없습니다</div>}
              </div>
            );
          })}
        </div>
      )}
      <div className="grid cols-2 mt12">
        {mode === "compare" &&
          kpis
            .filter((k) => k.values.length > 1)
            .map((k) => (
              <ChartCard key={k.key} title={k.label} note={k.values.some((v) => v.status === "candidate") ? "확인 전 값이 섞여 있습니다" : undefined}>
                <BarChart tokens={tokens} label={k.label} items={k.values.map((v) => ({ entity: v.entity, label: v.entity, display: v.display, value: v.value, role: v.role, fact_id: v.fact_id }))} />
              </ChartCard>
            ))}
        {series.length > 0 && (
          <ChartCard title="월별 게시 수">
            <LineChart tokens={tokens} label={`${ch.label} 월별 게시 수`} categories={ch.monthly_posts.months.map((m) => m.slice(2).replace("-", "."))} series={series} />
          </ChartCard>
        )}
        {sentiment.length > 0 &&
          (mode === "self" ? (
            sentiment.map((s) => (
              <ChartCard key={s.entity} title="댓글 반응" note={`댓글 ${s.n.toLocaleString()}개 · ${s.method}`}>
                <BarChart tokens={tokens} label="댓글 반응" items={s.rates.map((r) => ({ entity: s.entity, label: r.label, display: r.display, value: r.value, role: r.polarity === "positive" ? "self" : "other" }))} />
              </ChartCard>
            ))
          ) : (
            <ChartCard title="부정 댓글 비율" note={`${sentiment[0].method} · 댓글 수 ${sentiment.map((s) => `${s.entity} ${s.n.toLocaleString()}`).join(", ")}`}>
              <BarChart
                tokens={tokens}
                label="부정 댓글 비율"
                items={sentiment.flatMap((s) => s.rates.filter((r) => r.polarity === "negative").map((r) => ({ entity: s.entity, label: s.entity, display: r.display, value: r.value, role: s.role })))}
              />
            </ChartCard>
          ))}
      </div>
    </div>
  );
}

function ConsumerBlock({ s, mode, tokens }: { s: OwnedSummary; mode: Mode; tokens: Tokens }) {
  const self = s.brand.name;
  const pick = <T extends { entity: string }>(xs: T[]) => (mode === "self" ? xs.filter((x) => x.entity === self) : xs);
  const pains = pick(s.pain_points);
  const neg = pick(s.voc_negative).filter((v) => mode === "self" || v.site === "전체" || v.site == null);
  const mentions = pick(s.mentions);
  const blogs = s.blog_types.filter((b) => b.entity === self);
  const roleOf = (e: string) => (e === self ? "self" : "competitor");
  const charts: React.ReactNode[] = [];
  if (mode === "self") {
    if (pains.length)
      charts.push(
        <ChartCard key="pain" title="자주 나온 불만" note="채택한 원문·댓글에서 AI가 묶어 셈">
          <BarChart tokens={tokens} label="자주 나온 불만" items={pains.slice(0, 6).map((p) => ({ entity: p.entity, label: p.pain_point ?? "기타", display: p.display, value: p.value, role: "other" }))} />
        </ChartCard>,
      );
    if (neg.length)
      charts.push(
        <ChartCard key="neg" title="원문 부정 비율 (사이트별)">
          <BarChart tokens={tokens} label="원문 부정 비율" items={neg.map((v) => ({ entity: v.entity, label: v.site ?? "전체", display: v.display, value: v.value, role: "self" }))} />
        </ChartCard>,
      );
    for (const b of blogs)
      charts.push(
        <ChartCard key={`blog-${b.keyword}`} title={`블로그 글 유형 · ${b.keyword}`} note={b.n ? `상위 글 ${b.n}개` : undefined}>
          <BarChart tokens={tokens} label="블로그 글 유형" items={b.shares.map((x) => ({ entity: b.entity, label: x.label ?? "기타", display: x.display, value: x.value, role: x.type === "real_use" ? "self" : "other" }))} />
        </ChartCard>,
      );
    if (mentions.length)
      charts.push(
        <ChartCard key="mention" title="언급량 (검색 결과 문서 수)">
          <BarChart tokens={tokens} label="언급량" items={mentions.map((m) => ({ entity: m.entity, label: [m.keyword_group, m.channel_label].filter(Boolean).join(" · "), display: m.display, value: m.value, role: "self" }))} />
        </ChartCard>,
      );
  } else {
    const totals = new Map<string, number>();
    for (const m of mentions) totals.set(m.entity, (totals.get(m.entity) ?? 0) + m.value);
    if (totals.size > 1)
      charts.push(
        <ChartCard key="mention" title="언급량 합계 (검색 결과 문서 수)">
          <BarChart tokens={tokens} label="언급량 합계" items={[...totals].map(([e, v]) => ({ entity: e, label: e, display: v.toLocaleString("ko-KR"), value: v, role: roleOf(e) }))} />
        </ChartCard>,
      );
    if (neg.length > 1)
      charts.push(
        <ChartCard key="neg" title="원문 부정 비율">
          <BarChart tokens={tokens} label="원문 부정 비율" items={neg.map((v) => ({ entity: v.entity, label: v.entity, display: v.display, value: v.value, role: roleOf(v.entity) }))} />
        </ChartCard>,
      );
    const byEntity = new Map<string, typeof pains>();
    for (const p of pains) byEntity.set(p.entity, [...(byEntity.get(p.entity) ?? []), p]);
    if (byEntity.size)
      charts.push(
        <ChartCard key="pain" title="브랜드별 자주 나온 불만">
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {[...byEntity].map(([e, ps]) => (
              <li key={e}>
                <strong>{e}</strong> — {ps.slice(0, 3).map((p) => `${p.pain_point ?? "기타"} ${p.display}`).join(", ")}
              </li>
            ))}
          </ul>
        </ChartCard>,
      );
  }
  if (!charts.length) return null;
  return (
    <div className="mt16">
      <h3 style={{ margin: 0 }}>소비자 반응</h3>
      <div className="grid cols-2 mt12">{charts}</div>
    </div>
  );
}

export function OwnedSummaryTab({ pid, mode, tokens, brands }: { pid: string; mode: Mode; tokens: Tokens; brands: { id: string; name: string }[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const { data: s, error } = useApi<OwnedSummary>(brandId ? `/projects/${pid}/owned-summary?brand_id=${brandId}` : null);
  const title = mode === "self" ? "자사 분석" : "경쟁사 비교";
  const pending = s ? s.channels.some((c) => c.kpis.some((k) => k.values.some((v) => v.status === "candidate"))) : false;
  return (
    <section className="card" aria-labelledby="owned-title">
      <div className="card-head">
        <div className="grow">
          <h2 id="owned-title">{title}</h2>
          <p>
            {mode === "self" ? "공식 계정과 소비자 반응을 채널별로 모아 봅니다." : "같은 지표를 경쟁사와 나란히 놓고 차이를 봅니다."}
            {pending && " ‘확인 전’ 값은 자료 확인에서 채택해야 장표에 쓰입니다."}
          </p>
        </div>
        {brands.length > 1 && (
          <label className="row" style={{ gap: 8 }}>
            <span className="small muted">브랜드</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ErrorBox error={error} />
      {!s && !error && <p className="muted">불러오는 중…</p>}
      {s?.empty && (
        <div className="empty">
          <strong>{s.empty.message}</strong>
          <Link href={s.empty.settings_path}>설정에서 공식 계정 등록하기 →</Link>
        </div>
      )}
      {s && mode === "compare" && s.entities.length < 2 && <p className="muted mt8">설정에 경쟁사가 없어 비교할 대상이 없습니다.</p>}
      {s?.channels.map((ch) => <ChannelBlock key={ch.channel} ch={ch} mode={mode} tokens={tokens} />)}
      {s && <ConsumerBlock s={s} mode={mode} tokens={tokens} />}
    </section>
  );
}

