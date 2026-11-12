"use client";

import Link from "next/link";
import { api, type MissingCause } from "@/lib/api";
import { useAction } from "@/lib/hooks";

// Why a slide has no page yet: the badge says which, the button goes where it gets fixed.
const CAUSE: Record<MissingCause, [string, string]> = {
  adopt: ["채택 대기", "b-warn"],
  collect: ["수집 필요", "b-bad"],
  setup: ["설정 필요", "b-warn"],
  upload: ["업로드 필요", "b-outline"],
  access: ["접근 불가", "b-outline"],
};

export function CauseBadge({ cause }: { cause: MissingCause | null }) {
  if (!cause) return null;
  const [label, cls] = CAUSE[cause];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function CauseAction({ pid, cause, action }: { pid: string; cause: MissingCause | null; action: string | null }) {
  if (!cause) return null;
  const to =
    cause === "adopt"
      ? { href: `/projects/${pid}/materials`, label: "채택하러 가기" }
      : cause === "upload" // P4-5: 자동 수집이 없는 자료는 자료 확인의 '보유 자료'에서 올린다
        ? { href: `/projects/${pid}/materials#client-data`, label: "보유 자료 올리기" }
      : cause === "setup"
        ? { href: action?.startsWith("설정") ? `/projects/${pid}/setup` : `/projects/${pid}/research`, label: "입력하러 가기" }
        : { href: `/projects/${pid}/research`, label: "조사 계획 보기" };
  return (
    <Link className="btn sm" href={to.href} title={action ?? undefined}>
      {to.label}
    </Link>
  );
}

/** One button that collects again every web item a missing slide waits on. */
export function RecollectButton({ pid, itemIds, onDone }: { pid: string; itemIds: string[]; onDone?: () => void }) {
  const run = useAction();
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return null;
  return (
    <button
      className="btn sm primary"
      disabled={run.busy}
      onClick={() =>
        run.run(async () => {
          await api.post(`/projects/${pid}/research-runs`, { item_ids: ids, force: true });
          onDone?.();
        }, "빠진 자료를 다시 모으고 있습니다. 진행은 조사 계획에서 볼 수 있습니다")
      }
    >
      빠진 자료 다시 모으기 ({ids.length})
    </button>
  );
}
