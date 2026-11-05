import { convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NodeContent, nodeData } from "./nodes";
import { isOverlayNode, nodeKind, type API } from "./scene";

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * Elements stacked above a node and overlapping it, drawn as SVG inside the node's overlay —
 * the overlay sits over the static canvas, so this keeps the z-order visually correct.
 */
const Above = memo(function Above({ api, origin, above, version }: { api: API; origin: Box; above: ExcalidrawElement[]; version: string }) {
  const [svg, setSvg] = useState<{ markup: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!above.length) return setSvg(null);
    let alive = true;
    const x = Math.min(...above.map((e) => e.x));
    const y = Math.min(...above.map((e) => e.y));
    exportToSvg({ elements: above, appState: { exportBackground: false, exportWithDarkMode: false, exportScale: 1 } as never, files: api.getFiles(), exportPadding: 0, skipInliningFonts: true } as never)
      .then((el: SVGSVGElement) => {
        el.setAttribute("style", "display:block;max-width:none;overflow:visible");
        if (alive) setSvg({ markup: el.outerHTML, x, y });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, version]);
  if (!svg || !above.length) return null;
  return <div data-no-export className="pointer-events-none absolute" style={{ left: svg.x - origin.x, top: svg.y - origin.y }} dangerouslySetInnerHTML={{ __html: svg.markup }} />;
});

function NodeOverlay({ api, el, zoom, scrollX, scrollY, above }: { api: API; el: ExcalidrawElement; zoom: number; scrollX: number; scrollY: number; above: ExcalidrawElement[] }) {
  return (
    <div
      data-node-overlay={el.id}
      className="pointer-events-none absolute overflow-hidden"
      style={{
        left: (el.x + scrollX) * zoom,
        top: (el.y + scrollY) * zoom,
        width: el.width,
        height: el.height,
        transform: `scale(${zoom}) rotate(${el.angle}rad)`,
        transformOrigin: el.angle ? `${el.width / 2}px ${el.height / 2}px` : "0 0",
        opacity: el.opacity / 100,
        borderRadius: el.roundness ? 12 : 0,
      }}
    >
      <div data-node-content className="absolute inset-0">
        <NodeContent id={el.id} kind={nodeKind(el)!} data={nodeData(el)} />
      </div>
      <Above api={api} origin={el} above={above} version={above.map((e) => `${e.id}:${e.version}`).join(",")} />
    </div>
  );
}

/**
 * HTML overlays for rectangle-backed nodes, mounted between Excalidraw's static canvas and its
 * interactive canvas: content covers the plain rectangle, selection handles stay on top.
 */
export function NodeOverlayLayer({ api, root, zoom, scrollX, scrollY, sceneKey }: { api: API; root: HTMLElement | null; zoom: number; scrollX: number; scrollY: number; sceneKey: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const wrapper = root?.querySelector(".excalidraw__canvas-wrapper");
    if (!wrapper?.parentElement) return;
    const layer = document.createElement("div");
    layer.className = "node-overlay-layer";
    wrapper.parentElement.insertBefore(layer, wrapper.nextSibling);
    setHost(layer);
    return () => {
      layer.remove();
      setHost(null);
    };
  }, [root]);
  if (!host) return null;
  void sceneKey;
  const els = api.getSceneElements();
  const items = els.flatMap((el, i) => {
    if (!isOverlayNode(el)) return [];
    const above = els.slice(i + 1).filter((o) => !isOverlayNode(o) && !("containerId" in o && o.containerId === el.id) && overlaps(o, el));
    return [{ el, above }];
  });
  return createPortal(
    items.map(({ el, above }) => <NodeOverlay key={el.id} api={api} el={el} zoom={zoom} scrollX={scrollX} scrollY={scrollY} above={above} />),
    host,
  );
}

/** Cheap change key for overlay rendering ("" when the scene has no overlay nodes). */
export function overlaySceneKey(els: readonly ExcalidrawElement[]) {
  let has = false;
  let sum = 0;
  for (const e of els) {
    if (!e.isDeleted && isOverlayNode(e)) has = true;
    sum += e.version;
  }
  return has ? `${els.length}:${sum}` : "";
}

/**
 * For export: snapshots each overlay node's HTML into a PNG image element placed over it,
 * so PNG / SVG exports and thumbnails contain the node content.
 */
export async function withNodeSnapshots(elements: readonly ExcalidrawElement[], files: BinaryFiles, scale = 2): Promise<{ elements: ExcalidrawElement[]; files: BinaryFiles }> {
  const nodes = elements.filter((e) => !e.isDeleted && isOverlayNode(e));
  if (!nodes.length || typeof document === "undefined") return { elements: [...elements], files };
  const { domToPng } = await import("modern-screenshot");
  const out: ExcalidrawElement[] = [...elements];
  const extra: BinaryFiles = { ...files };
  for (const n of nodes) {
    const node = document.querySelector<HTMLElement>(`[data-node-overlay="${CSS.escape(n.id)}"] [data-node-content]`);
    if (!node) continue;
    try {
      const dataURL = await domToPng(node, { width: n.width, height: n.height, scale: Math.max(scale, window.devicePixelRatio || 1), filter: (el) => !(el instanceof HTMLElement && el.dataset.noExport !== undefined) });
      const fileId = `node-${n.id}-${n.version}`;
      extra[fileId] = { id: fileId, mimeType: "image/png", dataURL, created: Date.now() } as BinaryFileData;
      const [img] = convertToExcalidrawElements([{ type: "image", fileId, x: n.x, y: n.y, width: n.width, height: n.height, angle: n.angle, opacity: n.opacity, groupIds: n.groupIds, frameId: n.frameId } as never]);
      out.splice(out.indexOf(n) + 1, 0, { ...img, status: "saved" } as ExcalidrawElement);
    } catch {
      /* keep the plain rectangle */
    }
  }
  return { elements: out, files: extra };
}

/** Self-updating overlay layer for an Excalidraw instance (editor, embed, version preview). */
export function NodeOverlays({ api, root }: { api: API | null; root: HTMLElement | null }) {
  const [view, setView] = useState({ zoom: 1, scrollX: 0, scrollY: 0, key: "" });
  useEffect(() => {
    if (!api) return;
    const update = (els: readonly ExcalidrawElement[], s: { zoom: { value: number }; scrollX: number; scrollY: number }) =>
      setView((v) => {
        const key = overlaySceneKey(els);
        return v.zoom === s.zoom.value && v.scrollX === s.scrollX && v.scrollY === s.scrollY && v.key === key ? v : { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY, key };
      });
    update(api.getSceneElements(), api.getAppState());
    return api.onChange((els, s) => update(els, s));
  }, [api]);
  if (!api || !root || !view.key) return null;
  return <NodeOverlayLayer api={api} root={root} zoom={view.zoom} scrollX={view.scrollX} scrollY={view.scrollY} sceneKey={view.key} />;
}
