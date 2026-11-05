import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 320;
const MIN_CANVAS = 160;

/** Panel width remembered per key in localStorage. */
export function usePanelWidth(key: string, fallback: number) {
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (w: number) => {
    setWidth(w);
    try {
      localStorage.setItem(key, String(Math.round(w)));
    } catch {
      /* storage unavailable */
    }
  };
  return [width, set, fallback] as const;
}

/** Drag handle on the left edge of a right-side panel. Double-click resets, arrow keys nudge. */
export function ResizeHandle({ width, defaultWidth, onResize }: { width: number; defaultWidth: number; onResize: (w: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const clamp = (w: number) => {
    const host = ref.current?.parentElement?.parentElement?.clientWidth ?? window.innerWidth;
    return Math.min(Math.max(w, MIN_WIDTH), Math.max(MIN_WIDTH, Math.min(host * 0.9, host - MIN_CANVAS)));
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    document.documentElement.style.userSelect = "";
    setDragging(false);
  };
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="调整面板宽度"
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_WIDTH}
      tabIndex={0}
      className="group/resizer absolute inset-y-0 -left-1.5 z-10 w-3 cursor-ew-resize touch-none outline-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { id: e.pointerId, x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.documentElement.style.userSelect = "none";
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHoverY(Math.min(Math.max(e.clientY - r.top, 0), r.height));
        const d = drag.current;
        if (d && d.id === e.pointerId) {
          const w = clamp(d.w - (e.clientX - d.x));
          if (w !== width) onResize(w);
        }
      }}
      onPointerLeave={() => !drag.current && setHoverY(null)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => onResize(clamp(defaultWidth))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === "ArrowLeft") onResize(clamp(width + step));
        else if (e.key === "ArrowRight") onResize(clamp(width - step));
        else return;
        e.preventDefault();
      }}
    >
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#c9cdd4] opacity-0 transition-opacity", dragging && "opacity-100")} />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#86909c] opacity-0 transition-opacity group-focus-visible/resizer:opacity-100",
          (hoverY !== null || dragging) && "opacity-100",
          dragging && "bg-[#4e5969]",
        )}
        style={{ top: hoverY !== null ? hoverY : "50%" }}
      />
    </div>
  );
}
