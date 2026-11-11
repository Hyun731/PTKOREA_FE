"use client";

// 화면용 차트: 편집기 장표의 막대·선 차트(slide-view BlockView)를 그대로 써서 장표와 같은 모양으로 그린다.
// 새 차트 라이브러리는 넣지 않는다.
import { BlockView } from "@/components/editor/slide-view";
import type { BarChartBlock, LineChartBlock, Tokens } from "@/components/editor/types";

export type BarItem = { entity: string; label: string; display: string; value: number; role: string; fact_id?: string };
export type LineSeries = { entity: string; role: string; points: { month: string; value: number | null }[] };

const WIDTH = 520;
// 화면 데이터의 역할(self/competitor)을 장표 색 역할로 바꾼다.
const role = (r: string) => (r === "self" ? "self" : "other");

function Frame({ height, label, children }: { height: number; label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} style={{ overflowX: "auto", maxWidth: "100%" }}>
      <div style={{ position: "relative", width: WIDTH, height }}>{children}</div>
    </div>
  );
}

export function BarChart({ items, tokens, label }: { items: BarItem[]; tokens: Tokens; label: string }) {
  if (items.length === 0) return null;
  const height = items.length * 34 + 8;
  const b: BarChartBlock = {
    kind: "bar_chart",
    block_id: "chart",
    region: { x: 0, y: 0, w: WIDTH, h: height },
    items: items.map((i) => ({ ...i, fact_id: i.fact_id ?? "", role: role(i.role) })),
    label_size: 10,
  };
  return (
    <Frame height={height} label={`${label}: ${items.map((i) => `${i.label} ${i.display}`).join(", ")}`}>
      <BlockView b={b} tokens={tokens} assets={{}} />
    </Frame>
  );
}

export function LineChart({ categories, series, tokens, label }: { categories: string[]; series: LineSeries[]; tokens: Tokens; label: string }) {
  if (series.length === 0 || categories.length === 0) return null;
  const height = 220;
  const b: LineChartBlock = {
    kind: "line_chart",
    block_id: "chart",
    region: { x: 0, y: 0, w: WIDTH, h: height },
    categories,
    series: series.map((s) => ({ ...s, role: role(s.role) })),
  };
  return (
    <Frame height={height} label={`${label}: ${series.map((s) => s.entity).join(", ")}`}>
      <BlockView b={b} tokens={tokens} assets={{}} />
    </Frame>
  );
}
