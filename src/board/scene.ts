import { convertToExcalidrawElements, newElementWith, restoreElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type API = ExcalidrawImperativeAPI;
export type Element = ExcalidrawElement;
export type NodeKind = "markdown" | "code" | "chart" | "codeblock" | "video" | "link";

/** Links that mark an embeddable as one of our custom nodes (rendered by renderEmbeddable). */
export const NODE_LINK_PREFIX = "https://draw.local/node/";
export const nodeLink = (kind: NodeKind) => `${NODE_LINK_PREFIX}${kind}`;

/**
 * Kinds drawn as a plain rectangle with an HTML overlay on top (content, not interactive);
 * the rest (code display, video) stay Excalidraw embeddables.
 */
export const OVERLAY_KINDS = new Set<NodeKind>(["markdown", "codeblock", "chart", "link"]);

export const nodeKind = (el: { type: string; link?: string | null; customData?: Record<string, unknown> }): NodeKind | null => {
  if (el.type === "rectangle") {
    const k = el.customData?.kind as NodeKind | undefined;
    return k && OVERLAY_KINDS.has(k) ? k : null;
  }
  return el.type === "embeddable" && el.link?.startsWith(NODE_LINK_PREFIX) ? ((el.customData?.kind as NodeKind) ?? (el.link.slice(NODE_LINK_PREFIX.length) as NodeKind)) : null;
};
export const isOverlayNode = (el: { type: string; customData?: Record<string, unknown> }) => el.type === "rectangle" && OVERLAY_KINDS.has(el.customData?.kind as NodeKind);

/** Canvas style of the rectangle behind each overlay kind. */
const OVERLAY_STYLE: Record<string, Record<string, unknown>> = {
  markdown: { strokeColor: "#e4e4e7", backgroundColor: "#ffffff", roundness: null },
  codeblock: { strokeColor: "transparent", backgroundColor: "#f5f6f8", roundness: null },
  chart: { strokeColor: "transparent", backgroundColor: "#ffffff", roundness: null },
  link: { strokeColor: "#e4e4e7", backgroundColor: "#ffffff", roundness: { type: 3, value: 12 } },
};

/** Older boards stored overlay kinds as embeddables; turn them into rectangles (same id and version, so no resync). */
export function migrateNode<T extends { type: string; link?: string | null; customData?: Record<string, unknown> }>(el: T): T {
  if (el.type !== "embeddable" || !el.link?.startsWith(NODE_LINK_PREFIX)) return el;
  const kind = (el.customData?.kind as NodeKind | undefined) ?? (el.link.slice(NODE_LINK_PREFIX.length) as NodeKind);
  if (!OVERLAY_KINDS.has(kind)) return el;
  return { ...el, type: "rectangle", link: null, fillStyle: "solid", strokeWidth: 1, roughness: 0, ...OVERLAY_STYLE[kind], customData: { ...el.customData, kind } };
}

/** Scene point at the center of the visible viewport. */
export function viewportCenter(api: API) {
  const s = api.getAppState();
  return viewportCoordsToSceneCoords({ clientX: s.width / 2 + s.offsetLeft, clientY: s.height / 2 + s.offsetTop }, s);
}

/** Adds elements centered on the viewport (or at `at`) and selects them. */
export function insertElements(api: API, elements: ExcalidrawElement[], at?: { x: number; y: number }) {
  if (!elements.length) return;
  const minX = Math.min(...elements.map((e) => e.x));
  const minY = Math.min(...elements.map((e) => e.y));
  const maxX = Math.max(...elements.map((e) => e.x + e.width));
  const maxY = Math.max(...elements.map((e) => e.y + e.height));
  const c = at ?? viewportCenter(api);
  const dx = c.x - (minX + maxX) / 2;
  const dy = c.y - (minY + maxY) / 2;
  const moved = elements.map((e) => newElementWith(e, { x: e.x + dx, y: e.y + dy }));
  const selected: Record<string, true> = {};
  const groups = new Set(moved.flatMap((e) => e.groupIds));
  moved.forEach((e) => {
    if (!(e.type === "text" && e.containerId)) selected[e.id] = true;
  });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...moved],
    appState: {
      selectedElementIds: selected,
      selectedGroupIds: Object.fromEntries([...groups].map((g) => [g, true])),
    } as Partial<AppState> as AppState,
    captureUpdate: "IMMEDIATELY",
  });
  api.setActiveTool({ type: "selection" });
  return moved;
}

/** Full embeddable element (convertToExcalidrawElements passes iframe-like skeletons through unchanged). */
export function createEmbeddable(link: string, width: number, height: number, customData?: Record<string, unknown>) {
  const [el] = restoreElements(
    [
      {
        id: randomId(),
        type: "embeddable",
        x: 0,
        y: 0,
        width,
        height,
        link,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        roughness: 0,
        strokeWidth: 1,
        customData,
      } as never,
    ],
    null,
  );
  return el as ExcalidrawElement;
}

export function createNode(kind: NodeKind, width: number, height: number, customData: Record<string, unknown>) {
  if (OVERLAY_KINDS.has(kind)) {
    const [el] = convertToExcalidrawElements([{ type: "rectangle", x: 0, y: 0, width, height, fillStyle: "solid", strokeWidth: 1, roughness: 0, ...OVERLAY_STYLE[kind], customData: { kind, ...customData } } as never]);
    return el as ExcalidrawElement;
  }
  return createEmbeddable(nodeLink(kind), width, height, { kind, ...customData });
}

/** Replaces elements by id with updated copies (bumps version so peers accept the change). */
export function updateElements(api: API, updates: Record<string, Partial<ExcalidrawElement>>, capture: "IMMEDIATELY" | "NEVER" = "IMMEDIATELY") {
  const next = api.getSceneElementsIncludingDeleted().map((e) => (updates[e.id] ? newElementWith(e, updates[e.id] as never) : e));
  api.updateScene({ elements: next, captureUpdate: capture });
}

export function selectedElements(api: API, appState: Pick<AppState, "selectedElementIds">) {
  return api.getSceneElements().filter((e) => appState.selectedElementIds[e.id]) as NonDeletedExcalidrawElement[];
}

export const randomId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
