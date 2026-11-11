"use client";

// P4-5 보유 자료: 고객이 가진 설문·내부 리포트·SNS 인사이트 수치를 양식(엑셀·CSV)으로 올린다.
// 올린 배치는 확인 후 '채택'해야 계산·장표에 쓰인다(자동 채택 없음). 채택한 수치는 바로 아래 차트로 보인다.
import { useState } from "react";
import { BarChart, LineChart, type BarItem, type LineSeries } from "@/components/data-chart";
import type { Tokens } from "@/components/editor/types";
import { ErrorBox, FileButton, Status, fmtDate } from "@/components/ui";
import { api, fileUrl, type Batch } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

type ClientRow = { id: string; entity: string; label: string | null; unit: string; segment: string | null; n: string | null; display: string; period_start: string; period_end: string; source: string };
type ClientChart = {
  label: string;
  unit: string;
  segment: string | null;
  sources: string[];
  n: number[];
} & ({ kind: "bar_chart"; period: [string, string]; items: BarItem[] } | { kind: "line_chart"; categories: string[]; series: LineSeries[] });
type ClientData = { batches: (Batch & { rows: ClientRow[] })[]; charts: ClientChart[] };

const COLUMNS = "대상(브랜드·경쟁사 이름) · 지표 · 값 · 단위(%, 만원, 명, 점 등) · 시작일 · 종료일 · 구분(선택) · 응답자 수(선택) · 출처 · 출처 날짜(선택)";
const period = (a: string, b: string) => `${a.replaceAll("-", ".")} ~ ${b.replaceAll("-", ".")}`;

export function ClientDataSection({ pid, tokens, onChanged }: { pid: string; tokens: Tokens; onChanged: () => void }) {
  const { data, reload } = useApi<ClientData>(`/projects/${pid}/client-data`);
  const action = useAction();
  const [pdf, setPdf] = useState<File | null>(null);
  const after = async () => {
    await reload();
    onChanged();
  };
  const upload = (file: File) =>
    action.run(async () => {
      const fd = new FormData();
      fd.append("kind", "client");
      fd.append("file", file);
      if (pdf) fd.append("source_file", pdf);
      await api.post(`/projects/${pid}/imports`, fd);
      setPdf(null);
      await after();
    }, "보유 자료를 올렸습니다. 내용을 확인한 뒤 채택하세요");
  const review = (b: Batch, act: "accept" | "reject") =>
    action.run(async () => {
      await api.post(`/imports/${b.id}/review`, act === "accept" ? { action: "accept" } : { action: "reject", reason: "자료 확인에서 뺌" });
      await after();
    }, act === "accept" ? `${b.filename} 자료를 채택했습니다` : "자료를 뺐습니다");
  const batches = (data?.batches ?? []).filter((b) => b.status !== "replaced");
  return (
    <section className="card" id="client-data" aria-labelledby="client-title">
      <div className="card-head">
        <div className="grow">
          <h2 id="client-title">보유 자료 (설문·내부 리포트·SNS 인사이트)</h2>
          <p>고객이 가진 수치를 양식에 한 줄씩 적어 올리세요. 확인한 뒤 ‘채택’해야 장표에 쓰이고, 각주에는 ‘고객 제공 · 출처’로 표시됩니다.</p>
        </div>
        <a className="btn" href={fileUrl("/imports/client-template.csv")} download>
          양식 내려받기
        </a>
      </div>
      <div className="row wrap">
        <FileButton label="엑셀·CSV 파일 올리기" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onFile={upload} disabled={action.busy} primary />
        {pdf ? (
          <span className="small">
            원문 PDF: {pdf.name}{" "}
            <button className="btn sm ghost" onClick={() => setPdf(null)} disabled={action.busy}>
              빼기
            </button>
          </span>
        ) : (
          <FileButton label="원문 PDF 함께 올리기 (선택)" accept=".pdf,application/pdf" onFile={setPdf} disabled={action.busy} />
        )}
      </div>
      <p className="small muted mt8">양식 열: {COLUMNS}</p>
      <ErrorBox error={action.error} />
      {batches.length > 0 && (
        <ul className="list mt16">
          {batches.map((b) => (
            <li key={b.id}>
              <div className="grow">
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="title">{b.filename}</span>
                  <Status value={b.status} />
                </div>
                <div className="meta num">
                  수치 {b.valid_rows}/{b.total_rows}줄{b.errors.length ? ` · 고칠 줄 ${b.errors.length}` : ""} · {fmtDate(b.created_at)}
                  {b.has_source_file && (
                    <>
                      {" · "}
                      <a href={fileUrl(`/imports/${b.id}/source.pdf`)} target="_blank" rel="noreferrer">
                        원문 PDF
                      </a>
                    </>
                  )}
                  {b.errors.length > 0 && (
                    <>
                      {" · "}
                      <a href={fileUrl(`/imports/${b.id}/errors.csv`)}>고칠 줄 내려받기</a>
                    </>
                  )}
                </div>
                {b.rows.length > 0 && (
                  <details className="more">
                    <summary>올린 수치 보기 ({b.rows.length})</summary>
                    <div style={{ overflowX: "auto" }}>
                      <table className="table small mt8">
                        <thead>
                          <tr>
                            <th>대상</th>
                            <th>지표</th>
                            <th>값</th>
                            <th>구분</th>
                            <th>기간</th>
                            <th>출처</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.rows.map((r) => (
                            <tr key={r.id}>
                              <td>{r.entity}</td>
                              <td>{r.label}</td>
                              <td className="num">{r.display}</td>
                              <td>{[r.segment, r.n ? `응답 ${Number(r.n).toLocaleString()}명` : null].filter(Boolean).join(" · ") || "—"}</td>
                              <td className="num">{period(r.period_start, r.period_end)}</td>
                              <td>{r.source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
              <div className="actions">
                {b.status !== "accepted" && (
                  <button className="btn sm primary" disabled={action.busy || b.valid_rows === 0} onClick={() => review(b, "accept")}>
                    채택
                  </button>
                )}
                {b.status !== "rejected" && (
                  <button className="btn sm ghost" disabled={action.busy} onClick={() => review(b, "reject")}>
                    빼기
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(data?.charts.length ?? 0) > 0 && (
        <div className="grid cols-2 mt16">
          {data!.charts.map((c) => {
            const title = [c.label, c.segment].filter(Boolean).join(" · ");
            const note = [c.kind === "bar_chart" ? period(c.period[0], c.period[1]) : null, c.n.length ? `응답 ${c.n.map((n) => n.toLocaleString()).join("·")}명` : null, ...c.sources].filter(Boolean).join(" · ");
            return (
              <div key={`${c.label}|${c.unit}|${c.segment ?? ""}`} className="stat" style={{ minWidth: 0 }}>
                <div className="title">{title}</div>
                <div className="small muted">{note}</div>
                <div className="mt8">
                  {c.kind === "bar_chart" ? <BarChart tokens={tokens} label={title} items={c.items} /> : <LineChart tokens={tokens} label={title} categories={c.categories} series={c.series} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
