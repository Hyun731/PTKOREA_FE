// Where each input ends up in the deck. One source of truth for the inline "↳ 쓰이는 곳"
// line and the slide map panel. Keep these honest: if an input is not used in output yet,
// say so instead of implying it is.

export type SlideKind = "cover" | "index" | "share" | "trend" | "combo" | "target" | "creator" | "case" | "market" | "recap" | "source" | "none";

export type Impact = {
  where: string; // short, shown under the field
  how: string; // one or two sentences, shown in the panel
  slide: SlideKind;
  regions: string[];
  also?: string; // other outputs (ledgers, other slides)
};

export const SLIDE_NAME: Record<SlideKind, string> = {
  cover: "표지",
  index: "목차(INDEX)",
  share: "2-8a 브랜드명 검색 점유",
  trend: "2-8b 월별 검색 지수",
  combo: "2-8c 조합어 검색 점유",
  target: "2-8d 키 타겟 검색 점유",
  creator: "3-1 크리에이터 게시물",
  case: "C1 캠페인 사례 카드",
  market: "M1 시장·타겟 근거",
  recap: "5 Recap",
  source: "A 출처 표",
  none: "장표에 직접 나오지 않음",
};

export const IMPACT: Record<string, Impact> = {
  // ---------------------------------------------------------------- project
  "project.name": { where: "표지 제목 둘째 줄", how: "표지 가운데 큰 글씨 두 줄 중 아래 줄에 들어갑니다. 내려받는 PPTX 파일 이름에도 쓰입니다.", slide: "cover", regions: ["cover.name"] },
  "project.client": { where: "표지 제목 첫째 줄", how: "표지 가운데 큰 글씨의 첫 줄입니다.", slide: "cover", regions: ["cover.client"] },
  "project.period": { where: "조사 계획 기본 기간 · 각주 기간", how: "섹션별 조사 기간의 기본값이 되고, 인플루언서 장표는 이 기간에 올라온 게시물만 셉니다. 데이터 장표 각주에 실제 날짜로 표시됩니다.", slide: "creator", regions: ["footnote", "table.rows"] },
  "project.cutoff": { where: "아직 출력에 쓰이지 않음", how: "기록용으로 저장합니다. 자동 수집이 연결되면 이 날짜 이후 자료는 가져오지 않는 기준이 됩니다.", slide: "none", regions: [] },
  "project.hypothesis": { where: "장표에 쓰이지 않음 (기획자 참고)", how: "타겟 가설은 의견이라 사실로 장표에 넣지 않습니다. 팀이 조사 방향을 맞추는 참고용입니다.", slide: "none", regions: [] },
  "project.slides": { where: "만들 장표 목록 · INDEX", how: "체크한 장표만 조사 계획, 출력 검수, 목차(INDEX)에 들어갑니다. 끄면 해당 섹션은 계획에서 빠집니다.", slide: "index", regions: ["index.items"] },
  "project.windows": { where: "데이터 장표 각주의 기간", how: "섹션마다 실제 시작·종료일이 각주에 그대로 표시되고, 인플루언서 섹션은 이 기간의 게시물만 계산합니다.", slide: "share", regions: ["footnote"] },

  // ---------------------------------------------------------------- brand
  "brand.name": { where: "검색 장표 남색 막대 · 리드 문장", how: "자사 막대(남색)와 선 그래프의 이름이 되고, 리드 문장 주어로 쓰입니다. CSV의 entity 값과 똑같아야 계산됩니다.", slide: "share", regions: ["bars.self", "lead", "bars.labels"] },
  "brand.id": { where: "CSV의 brand 열과 연결", how: "장표에 보이지 않습니다. 업로드하는 CSV의 brand 열이 이 값과 같아야 해당 브랜드 데이터로 읽힙니다.", slide: "none", regions: [] },
  "brand.categories": { where: "검색 장표 회색 머리글", how: "첫 번째 카테고리가 막대 그래프 위 회색 머리글(예: ‘브랜드A 세트 · 가방 (%)’)에 들어갑니다.", slide: "share", regions: ["panel.header"] },
  "brand.aliases": { where: "검색어 중복 검사", how: "장표에 보이지 않습니다. 같은 검색어가 여러 브랜드에 겹치지 않는지 검사할 때 씁니다.", slide: "none", regions: [] },
  "brand.competitors": { where: "검색 장표 회색·빨간 막대 · 점유 분모", how: "막대와 선 그래프에 경쟁사로 나오고, 점유율(%) 계산의 분모에 들어갑니다. 한 곳이라도 데이터가 없으면 점유율을 만들지 않습니다. 핵심 경쟁사는 빨간색으로 강조됩니다.", slide: "share", regions: ["bars.rival", "bars.other", "bars.labels"], also: "2-8b 선, 2-8c 막대, 2-8d 표에도 쓰입니다" },
  "brand.benchmarks": { where: "사례 카드 대상 후보 (점유 계산 제외)", how: "참고 사례로만 쓰입니다. 조사 계획에 사례 항목이 생기고 카드 대상으로 고를 수 있지만, 점유율 분모와 순위에는 넣지 않습니다.", slide: "case", regions: ["card.label"] },
  "brand.targetAge": { where: "조사 계획 · 시장·타겟 근거", how: "조사 계획의 질문과 기록에 남고, 시장·타겟 근거(M1)와 검색 CSV의 타겟(T) 구간을 고를 때 기준이 됩니다.", slide: "none", regions: [] },
  "brand.targetLabel": { where: "타겟 표 노란 칸 · 리드 문장", how: "2-8d 표의 ‘키 타겟’ 열(노란 칸)과 리드 문장, 각주의 타겟 정의에 그대로 표시됩니다.", slide: "target", regions: ["table.target", "lead", "footnote"] },

  // ---------------------------------------------------------------- material card
  "material.title": { where: "사례 카드 ▲ 링크 줄 · 출처 표", how: "카드 이미지 아래 파란 ▲ 링크 글자와, 부록 출처 표의 ‘자료’ 열에 들어갑니다.", slide: "case", regions: ["card.link"], also: "A 출처 표의 자료 이름" },
  "material.label": { where: "사례 카드 위 회색 탭", how: "카드 위쪽 회색 탭에 표시됩니다. 비우면 ‘대상 · 제목’으로 자동으로 만듭니다.", slide: "case", regions: ["card.label"] },
  "material.url": { where: "▲ 링크 줄 클릭 주소 · 출처 표 URL", how: "카드 링크 줄을 누르면 이 주소로 열리고, 출처 표에 클릭 가능한 URL로 들어갑니다. 바꾸면 이 자료의 채택된 문장은 재검토 상태가 됩니다.", slide: "case", regions: ["card.link"], also: "A 출처 표 URL 열, sources.csv" },
  "material.publisher": { where: "장표 하단 각주 출처명", how: "사례 장표 오른쪽 아래 각주(*출처명 날짜)에 들어갑니다.", slide: "case", regions: ["footnote"] },
  "material.published": { where: "각주 날짜 · 출처 표 일자", how: "각주의 출처 날짜와 출처 표 ‘일자’ 열에 쓰입니다. 날짜가 하나도 없으면 출력 검수에서 막힙니다.", slide: "case", regions: ["footnote"], also: "A 출처 표 일자 열" },
  "material.entity": { where: "리드 문장 · 카드 라벨 기본값", how: "‘경쟁X 캠페인 사례 — …’처럼 장표 리드 문장에 대상 이름이 들어가고, 라벨을 비웠을 때 라벨 앞부분이 됩니다.", slide: "case", regions: ["lead", "card.label"] },
  "material.section": { where: "어느 장표에 들어갈지", how: "캠페인 사례는 C1 카드, 시장·타겟은 M1 표, 인플루언서 레퍼런스는 3-1 표 왼쪽 이미지로 들어갑니다.", slide: "case", regions: ["card.frame"] },
  "material.activity": { where: "▲ 링크 줄 날짜", how: "카드 링크 줄 뒤에 ‘· 2026.03.02’처럼 붙습니다. 기간이면 ‘~종료일’까지 표시됩니다.", slide: "case", regions: ["card.link"] },
  "material.comment": { where: "장표에 쓰이지 않음 (팀 메모)", how: "기획자의 의도·참고 메모입니다. 원문 사실과 분리해 저장하며 장표에 자동으로 들어가지 않습니다.", slide: "none", regions: [] },
  "material.featured": { where: "캠페인 사례 딥다이브 슬라이드", how: "체크하면 카드 그리드 대신 큰 사진 + 기간 + 번호 매긴 인사이트로 된 전용 슬라이드 한 장을 따로 만듭니다.", slide: "case", regions: [] },
  "material.image": { where: "사례 카드 사진 칸", how: "‘장표에 사용’으로 고르고 채택한 이미지 한 장이 카드 사진 칸에 들어갑니다. 자른 영역이 잘리지 않고 그대로 맞춰 들어가며, PowerPoint에서 자르기를 다시 풀 수도 있습니다.", slide: "case", regions: ["card.image"], also: "assets.csv 이미지 원장" },
  "material.crop": { where: "사례 카드 사진에 보이는 영역", how: "고른 영역만 카드 사진 칸에 보입니다. 원본은 PPTX 안에 그대로 보존됩니다.", slide: "case", regions: ["card.image"] },
  "material.usage": { where: "이미지 원장에만 기록", how: "장표에 보이지 않습니다. assets.csv에 이미지 사용 근거로 남습니다.", slide: "none", regions: [] },
  "material.fact": { where: "사례 카드 ┃ 성과 줄", how: "확인한 수치는 카드의 ‘┃ 조회 116,799 · 반응률 0.97%’ 줄에 들어가고, 근거 문장에 칩으로 넣을 수 있습니다. 확인 전 수치는 장표에 쓰이지 않습니다.", slide: "case", regions: ["card.metrics"], also: "factbook.csv 수치 원장" },
  "claim.fact": { where: "사례 카드 ▸ 회색 설명", how: "원문에서 확인한 활동을 ‘▸’로 시작하는 회색 문장으로 보여 줍니다. 채택한 문장만 들어갑니다.", slide: "case", regions: ["card.desc"] },
  "claim.interpretation": { where: "사례 카드 → 남색 굵은 시사점", how: "카드 맨 아래 ‘→’로 시작하는 남색 굵은 줄로 들어갑니다. 근거 범위를 넘는 단정은 쓰지 마세요.", slide: "case", regions: ["card.impl"] },
  "claim.recommendation": { where: "사례 카드 → 남색 줄 (의견)", how: "해석과 같은 자리에 표시되지만 ‘기획자 의견’으로 따로 기록됩니다.", slide: "case", regions: ["card.impl"] },

  // ---------------------------------------------------------------- data
  "csv.facts": { where: "검색 장표 2-8a~d · Recap", how: "채택하면 브랜드명·조합어·타겟 검색 점유와 월별 지수를 계산해 검색 장표 네 종과 Recap의 ‘검색 경쟁’ 기둥을 만듭니다.", slide: "share", regions: ["bars.self", "bars.rival", "bars.other", "caption", "lead"], also: "2-8b, 2-8c, 2-8d, 5 Recap" },
  "csv.posts": { where: "인플루언서 표 3-1 · Recap", how: "채택하면 게시물별 조회·반응률 표와 광고 추정 후보 조회 비중을 계산합니다. 13행이 넘으면 표가 두 장으로 나뉩니다.", slide: "creator", regions: ["table.rows", "takeaway"], also: "5 Recap ‘콘텐츠·관측 성과’ 기둥" },
};

export const impact = (key: string): Impact | undefined => IMPACT[key];
