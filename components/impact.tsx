"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { SlideMap } from "@/components/slide-map";
import { SLIDE_NAME, impact } from "@/lib/impact";

type Ctx = { active: string | null; set: (k: string | null) => void };
const ImpactCtx = createContext<Ctx>({ active: null, set: () => {} });

/**
 * Wrap a form area. Focus or hover on any element inside a `[data-impact]` wrapper makes
 * that key the one explained by the ImpactPanel.
 */
export function ImpactZone({ initial, children, className = "" }: { initial: string; children: ReactNode; className?: string }) {
  const [active, set] = useState<string | null>(initial);
  const pick = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.("[data-impact]") as HTMLElement | null;
    if (el?.dataset.impact) set(el.dataset.impact);
  };
  return (
    <ImpactCtx.Provider value={{ active, set }}>
      <div className={className} onFocusCapture={(e) => pick(e.target)} onPointerOver={(e) => pick(e.target)}>
        {children}
      </div>
    </ImpactCtx.Provider>
  );
}

export const useImpactZone = () => useContext(ImpactCtx);

/** Sticky right panel: slide wireframe with the active field's region highlighted. */
export function ImpactPanel({ title = "이 칸이 쓰이는 곳" }: { title?: string }) {
  const { active } = useImpactZone();
  const i = active ? impact(active) : undefined;
  return (
    <aside className="impact-panel" aria-label="입력 항목이 장표에 쓰이는 곳" aria-live="polite">
      <div className="ip-title">{title}</div>
      {!i ? (
        <p className="small muted">입력 칸을 누르거나 마우스를 올리면, 그 내용이 장표 어디에 어떻게 들어가는지 보여 줍니다.</p>
      ) : (
        <>
          <div className="ip-where">{i.where}</div>
          {i.slide !== "none" ? (
            <>
              <SlideMap kind={i.slide} regions={i.regions} label={`${SLIDE_NAME[i.slide]}에서 강조된 영역`} />
              <div className="ip-slide">{SLIDE_NAME[i.slide]}</div>
            </>
          ) : (
            <div className="ip-none">장표에 직접 나오지 않는 항목</div>
          )}
          <p className="ip-how">{i.how}</p>
          {i.also && <p className="ip-also">함께 쓰이는 곳: {i.also}</p>}
        </>
      )}
    </aside>
  );
}
