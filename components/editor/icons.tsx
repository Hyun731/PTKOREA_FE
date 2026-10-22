// Line icons for the editor (24×24 grid, 1.6 stroke, square caps softened by round joins).
import type { SVGProps } from "react";

const P: Record<string, string> = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  cursor: "M5 3.5 18.5 10l-6 1.8-2.2 6.2L5 3.5Z",
  area: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M10 4h4M10 20h4M4 10v4M20 10v4",
  text: "M5 6V4.5h14V6M12 4.5v15M9 19.5h6",
  shape: "M4.5 4.5h15v15h-15z",
  rounded: "M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z",
  line: "M5 19 19 5",
  image: "M4.5 5.5h15v13h-15zM4.5 15.5l4-4 3.5 3.5 2.5-2.5 5 5M15 9.5h.01",
  minus: "M6 12h12",
  plus: "M12 6v12M6 12h12",
  play: "M8 5.5v13l10-6.5-10-6.5Z",
  download: "M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14",
  sparkle: "M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9 12 3.5ZM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z",
  copy: "M8.5 8.5h10v11h-10zM15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3",
  trash: "M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12M9.5 7V4.5h5V7",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  alignL: "M4.5 5.5h15M4.5 10h9M4.5 14.5h15M4.5 19h9",
  alignC: "M4.5 5.5h15M7.5 10h9M4.5 14.5h15M7.5 19h9",
  alignR: "M4.5 5.5h15M10.5 10h9M4.5 14.5h15M10.5 19h9",
  front: "M9.5 9.5h10v10h-10zM14.5 9.5V5.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4",
  back: "M4.5 4.5h10v10h-10zM9.5 14.5v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-4",
  check: "m5 12.5 4.5 4.5L19 7.5",
  shield: "M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z",
  alert: "M12 4 3.5 19h17L12 4ZM12 10v4.5M12 17h.01",
  send: "M4.5 12 19.5 5l-4 14.5-3.5-6-7.5-1.5Z",
  fit: "M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15",
  reset: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4",
  layers: "M12 4 3.5 8.5 12 13l8.5-4.5L12 4ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5",
  back2: "M15 5.5 8.5 12l6.5 6.5",
  dot: "M12 12h.01",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={P[name]} />
    </svg>
  );
}
