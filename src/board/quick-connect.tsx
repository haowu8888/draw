import { convertToExcalidrawElements, newElementWith, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { diagramOf } from "./diagram";
import { useEditor } from "./editor-context";
import { DEFAULT_STROKE } from "./ops";
import type { API } from "./scene";
import { shapeDef, shapeOf } from "./shapes";

type Side = "top" | "right" | "bottom" | "left";
type Box = { x: number; y: number; width: number; height: number };
const SIDES: Side[] = ["top", "right", "bottom", "left"];
const DIR: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const OPPOSITE: Record<Side, Side> = { top: "bottom", right: "left", bottom: "top", left: "right" };
const GAP = 6;
const HIT_OUT = 28;
const HIT_IN = 14;
const DOT_OFFSET = 16;
const NATIVE = new Set(["rectangle", "ellipse", "diamond"]);

const eligible = (e: ExcalidrawElement) => !e.isDeleted && !e.locked && e.angle === 0 && !e.customData?.kind && !diagramOf(e) && shapeOf(e) !== null;
const sidePoint = (b: Box, side: Side, out = 0) => {
  const [dx, dy] = DIR[side];
  return { x: b.x + b.width / 2 + dx * (b.width / 2 + out), y: b.y + b.height / 2 + dy * (b.height / 2 + out) };
};
const overlaps = (a: Box, b: Box, pad: number) => a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;

/** Where the new shape goes (first free slot beside `el`) and the elbow route to it. */
function plan(el: ExcalidrawElement, side: Side, scene: readonly ExcalidrawElement[]) {
  const [dx, dy] = DIR[side];
  const others = scene.filter((e) => !e.isDeleted && e.id !== el.id && e.type !== "arrow" && e.type !== "text" && e.type !== "frame");
  const target = { x: el.x + dx * (el.width + 100), y: el.y + dy * (el.height + 100), width: el.width, height: el.height };
  const [sx, sy] = dx === 0 ? [el.width + 50, 0] : [0, el.height + 50];
  const box = [0, 1, -1, 2, -2].map((k) => ({ ...target, x: target.x + sx * k, y: target.y + sy * k })).find((b) => !others.some((o) => overlaps(b, o, 20))) ?? target;
  const a = sidePoint(el, side, GAP);
  const b = sidePoint(box, OPPOSITE[side], GAP);
  let points = [a, b];
  if (dx !== 0 && a.y !== b.y) {
    const mx = (a.x + b.x) / 2;
    points = [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  } else if (dy !== 0 && a.x !== b.x) {
    const my = (a.y + b.y) / 2;
    points = [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  return { box, points };
}

const seed = () => Math.floor(Math.random() * 2 ** 31);

/** Adds a copy of `id` on `side`, connected by an arrow (bound for native shapes). Returns the new element. */
function addConnected(api: API, id: string, side: Side) {
  const scene = api.getSceneElementsIncludingDeleted();
  const el = scene.find((e) => e.id === id);
  if (!el || !eligible(el)) return null;
  const { box, points } = plan(el, side, scene);
  const [start] = points;
  const bindable = NATIVE.has(el.type);
  const frame = el.frameId ? scene.find((e) => e.id === el.frameId && !e.isDeleted) : undefined;
  const frameId = frame && box.x >= frame.x && box.y >= frame.y && box.x + box.width <= frame.x + frame.width && box.y + box.height <= frame.y + frame.height ? frame.id : null;
  const [arrow] = convertToExcalidrawElements([
    { type: "arrow", x: start.x, y: start.y, points: points.map((p) => [p.x - start.x, p.y - start.y]), strokeColor: DEFAULT_STROKE, strokeWidth: 2, roughness: el.roughness, startArrowhead: null, endArrowhead: "arrow" } as never,
  ]);
  const newId = crypto.randomUUID();
  const copy = { ...el, ...box, id: newId, seed: seed(), version: 1, versionNonce: seed(), updated: Date.now(), index: null, groupIds: [], frameId, link: null, boundElements: bindable ? [{ id: arrow.id, type: "arrow" }] : null } as ExcalidrawElement;
  const binding = (elementId: string) => ({ elementId, focus: 0, gap: GAP, fixedPoint: null });
  const link = { ...arrow, elbowed: false, frameId, startBinding: bindable ? binding(el.id) : null, endBinding: bindable ? binding(newId) : null } as ExcalidrawElement;
  api.updateScene({
    elements: [...scene.map((e) => (e.id === el.id && bindable ? newElementWith(e, { boundElements: [...(e.boundElements ?? []), { id: arrow.id, type: "arrow" }] }) : e)), copy, link],
    appState: { selectedElementIds: { [newId]: true } } as never,
    captureUpdate: "IMMEDIATELY",
  });
  return copy;
}

/** Hover dots on shape edges; clicking one adds a connected shape in that direction. */
export function QuickConnect() {
  const { api, ui } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLButtonElement>(null);
  const [hit, setHit] = useState<{ id: string; side: Side } | null>(null);
  const [preview, setPreview] = useState(false);
  const idle = !ui.busy && ui.tool === "selection" && !ui.editingText;

  useEffect(() => {
    if (!idle) {
      setHit(null);
      setPreview(false);
      return;
    }
    const host = root.current?.parentElement;
    if (!host) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (dotRef.current && e.target instanceof Node && dotRef.current.contains(e.target)) return;
      cancelAnimationFrame(raf);
      const { clientX, clientY, buttons } = e;
      raf = requestAnimationFrame(() => {
        if (buttons) return setHit(null);
        const s = api.getAppState();
        const p = viewportCoordsToSceneCoords({ clientX, clientY }, s);
        const z = s.zoom.value;
        const els = api.getSceneElements();
        let found: { id: string; side: Side } | null = null;
        for (let i = els.length - 1; i >= 0 && !found; i--) {
          const t = els[i];
          if (!eligible(t)) continue;
          const out = HIT_OUT / z;
          const inner = HIT_IN / z;
          for (const side of SIDES) {
            const inY = p.y >= t.y && p.y <= t.y + t.height;
            const inX = p.x >= t.x && p.x <= t.x + t.width;
            const ok =
              side === "left"
                ? inY && p.x >= t.x - out && p.x <= t.x + inner
                : side === "right"
                  ? inY && p.x <= t.x + t.width + out && p.x >= t.x + t.width - inner
                  : side === "top"
                    ? inX && p.y >= t.y - out && p.y <= t.y + inner
                    : inX && p.y <= t.y + t.height + out && p.y >= t.y + t.height - inner;
            if (ok) {
              found = { id: t.id, side };
              break;
            }
          }
        }
        setHit((h) => (h?.id === found?.id && h?.side === found?.side ? h : found));
        if (!found) setPreview(false);
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      setHit(null);
      setPreview(false);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [api, idle]);

  const el = hit ? api.getSceneElements().find((e) => e.id === hit.id) : undefined;
  const toView = (p: { x: number; y: number }) => ({ x: (p.x + ui.scrollX) * ui.zoom, y: (p.y + ui.scrollY) * ui.zoom });
  let dot: { x: number; y: number } | null = null;
  let ghost: { path: string; box: Box; points: string } | null = null;
  if (idle && hit && el && eligible(el)) {
    dot = toView(sidePoint(el, hit.side, DOT_OFFSET / ui.zoom));
    if (preview) {
      const p = plan(el, hit.side, api.getSceneElementsIncludingDeleted());
      const v = toView(p.box);
      ghost = {
        path: shapeDef(shapeOf(el) ?? "rectangle")?.d ?? "M0 0H100V100H0Z",
        box: { x: v.x, y: v.y, width: p.box.width * ui.zoom, height: p.box.height * ui.zoom },
        points: p.points
          .map(toView)
          .map((q) => `${q.x},${q.y}`)
          .join(" "),
      };
    }
  }

  return (
    <div ref={root} className="contents">
      {ghost && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-[3] size-full overflow-visible">
          <defs>
            <marker id="qc-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1L9 5L1 9" fill="none" stroke="var(--yx-quick-ghost)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          <polyline points={ghost.points} fill="none" strokeLinejoin="round" stroke="var(--yx-quick-ghost)" strokeWidth={2} strokeLinecap="round" markerEnd="url(#qc-head)" />
          <svg x={ghost.box.x} y={ghost.box.y} width={ghost.box.width} height={ghost.box.height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
            <path d={ghost.path} fill="none" stroke="var(--yx-quick-ghost)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </svg>
      )}
      {dot && (
        <button
          ref={dotRef}
          type="button"
          aria-label="向此方向添加形状"
          title="点击添加相连的形状"
          className={cn("pointer-events-auto absolute z-[4] flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full", preview && "bg-[var(--yx-selection)]/20")}
          style={{ left: dot.x, top: dot.y }}
          onPointerEnter={() => setPreview(true)}
          onPointerLeave={() => setPreview(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (!hit) return;
            const n = addConnected(api, hit.id, hit.side);
            if (n && NATIVE.has(n.type)) {
              // start typing a label right away
              const ex = root.current?.closest(".board-editor")?.querySelector(".excalidraw");
              requestAnimationFrame(() => ex?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })));
            }
            setHit(null);
            setPreview(false);
          }}
        >
          <span className={cn("rounded-full border-[1.5px] border-[var(--yx-selection)] transition-all duration-150", preview ? "size-3 bg-[var(--yx-selection)]" : "size-2.5 bg-background")} />
        </button>
      )}
    </div>
  );
}
