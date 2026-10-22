"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fileUrl, type Asset, type Crop } from "@/lib/api";

/** Shows exactly the region the PPTX will show: the crop, fitted (contain) into the slot. */
export function CroppedImage({ asset, height = "100%", label }: { asset: Asset; height?: string | number; label?: string }) {
  const c = asset.crop;
  const src = fileUrl(`/assets/${asset.id}/file?v=${asset.version}`);
  const posX = c.w >= 1 ? 0 : (c.x / (1 - c.w)) * 100;
  const posY = c.h >= 1 ? 0 : (c.y / (1 - c.h)) * 100;
  return (
    <div
      role="img"
      aria-label={label ?? `${asset.title} (자른 영역)`}
      style={{
        aspectRatio: `${asset.width * c.w} / ${asset.height * c.h}`,
        height,
        maxWidth: "100%",
        backgroundImage: `url(${src})`,
        backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

const clamp = (c: Crop): Crop => {
  const w = Math.min(1, Math.max(0.02, c.w));
  const h = Math.min(1, Math.max(0.02, c.h));
  return { x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)), w, h };
};
const pct = (v: number) => Math.round(v * 1000) / 10;

/**
 * Region selection on the original image. Mouse/touch drag, arrow keys (move) and
 * Shift+arrow keys (resize), or exact numbers. Coordinates are 0~1 of the original (PRD 7).
 */
export function CropTool({ asset, onSave, busy }: { asset: Asset; onSave: (c: Crop) => void; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<Crop>(asset.crop);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const hintId = useId();

  const point = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: PointerEvent) => {
    ref.current?.setPointerCapture?.(e.pointerId);
    const p = point(e);
    setDrag(p);
    setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    setCrop({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) });
  };
  const up = () => {
    setDrag(null);
    if (crop.w < 0.02 || crop.h < 0.02) setCrop(asset.crop);
  };
  const key = (e: KeyboardEvent) => {
    const step = e.altKey ? 0.002 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setCrop((c) => clamp(e.shiftKey ? { ...c, w: c.w + d[0], h: c.h + d[1] } : { ...c, x: c.x + d[0], y: c.y + d[1] }));
  };
  const setField = (k: keyof Crop, v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setCrop((c) => clamp({ ...c, [k]: n / 100 }));
  };
  const center169 = () => {
    const ar = asset.width / asset.height;
    if (ar > 16 / 9) {
      const w = (16 / 9) / ar;
      setCrop({ x: (1 - w) / 2, y: 0, w, h: 1 });
    } else {
      const h = ar / (16 / 9);
      setCrop({ x: 0, y: (1 - h) / 2, w: 1, h });
    }
  };

  const changed = JSON.stringify(crop) !== JSON.stringify(asset.crop);
  const pxW = Math.round(asset.width * crop.w);
  const pxH = Math.round(asset.height * crop.h);
  return (
    <div className="stack">
      <div
        ref={ref}
        className="crop-wrap"
        tabIndex={0}
        role="group"
        aria-label="자를 영역 선택"
        aria-describedby={hintId}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onKeyDown={key}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(`/assets/${asset.id}/file?v=${asset.version}`)} alt={`${asset.title} 원본`} draggable={false} />
        <div className="crop-rect" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
      </div>
      <p id={hintId} className="small muted">
        이미지 위를 드래그해 영역을 고르세요. 키보드: 이미지에 포커스한 뒤 방향키로 이동, Shift+방향키로 크기 조절. 장표에는 고른 영역이 잘리지 않고 그대로 들어가며, 원본은 보존됩니다.
      </p>
      <div className="grid cols-4">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} className="field">
            <span className="label">{{ x: "왼쪽 (%)", y: "위 (%)", w: "너비 (%)", h: "높이 (%)" }[k]}</span>
            <input type="number" min={0} max={100} step={0.5} value={pct(crop[k])} onChange={(e) => setField(k, e.target.value)} />
          </label>
        ))}
      </div>
      <div className="row wrap">
        <span className="grow small" role="status">
          선택 영역 <strong className="num">{pxW}×{pxH}px</strong>
          {pxW < 380 && <strong style={{ color: "var(--warn)" }}> · 해상도가 낮아 장표에서 흐릴 수 있습니다</strong>}
        </span>
        <button className="btn sm" onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}>
          전체 영역
        </button>
        <button className="btn sm" onClick={center169}>
          가운데 16:9
        </button>
        <button className="btn sm primary" disabled={!changed || busy} onClick={() => onSave(clamp(crop))}>
          이 영역으로 저장
        </button>
      </div>
    </div>
  );
}
