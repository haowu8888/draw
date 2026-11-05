import { convertToExcalidrawElements, exportToBlob, exportToSvg, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";
import { withNodeSnapshots } from "./node-overlays";
import type { API } from "./scene";
import { canWriteClipboardImage, copyText, uuid } from "@/lib/utils";

// ---------------- palette & style constants ----------------

export const PALETTE = [
  { id: "default", label: "默认", light: "#ffffff", stroke: "#242424" },
  { id: "gray", label: "灰", light: "#e4e4e4", stroke: "#3a3a3a" },
  { id: "red", label: "红", light: "#f8c0c0", stroke: "#bd413a" },
  { id: "orange", label: "橙", light: "#f8d8c0", stroke: "#c38424" },
  { id: "yellow", label: "黄", light: "#f7f8c0", stroke: "#d3d61e" },
  { id: "green", label: "绿", light: "#c0f8d0", stroke: "#30a050" },
  { id: "teal", label: "青", light: "#c0f0ec", stroke: "#1f9e94" },
  { id: "blue", label: "蓝", light: "#c7dcfc", stroke: "#2866c4" },
  { id: "purple", label: "紫", light: "#f4c0f8", stroke: "#c43dcf" },
  { id: "pink", label: "粉", light: "#fbc8e0", stroke: "#c93b7b" },
];
const LEGACY_DEFAULT = ["#1e1e1e", "#000000"];
export const DEFAULT_STROKE = PALETTE[0].stroke;

export const isPaletteColor = (c?: string | null) => !!c && (PALETTE.some((p) => p.stroke === c.toLowerCase()) || LEGACY_DEFAULT.includes(c.toLowerCase()));
export const sameColor = (c: string | null | undefined, swatch: string) => !!c && (c.toLowerCase() === swatch || (swatch === DEFAULT_STROKE && LEGACY_DEFAULT.includes(c.toLowerCase())));

export const STROKE_STYLES = [
  { value: "solid", label: "实线", dash: undefined },
  { value: "dashed", label: "虚线", dash: "4 3" },
  { value: "dotted", label: "点线", dash: "1 3" },
] as const;
export const STROKE_WIDTHS = [
  { value: 1, label: "S" },
  { value: 2, label: "M" },
  { value: 4, label: "L" },
  { value: 6, label: "XL" },
];
export const FONT_SIZES = [
  { value: 16, label: "小" },
  { value: 24, label: "中" },
  { value: 36, label: "大" },
  { value: 56, label: "特大" },
];
export const FONTS = [
  { id: 5, label: "Excalifont", cjk: "小赖手写", css: "Excalifont, Xiaolai, var(--font-sans)" },
  { id: 2, label: "Inter", cjk: "系统黑体", css: "var(--font-sans)" },
  { id: 3, label: "Mono", cjk: "系统黑体", css: "var(--font-mono)" },
];
export const LINE_HEIGHTS = [1, 1.25, 1.5, 2];
export const OPACITIES = [25, 50, 75, 100];

// ---------------- selection helpers ----------------

export function selectedEls(api: API) {
  const { selectedElementIds } = api.getAppState();
  return api.getSceneElements().filter((e) => selectedElementIds[e.id]);
}

/** Selected elements plus the text bound inside selected containers. */
export function selectedWithText(api: API) {
  const sel = selectedEls(api);
  const ids = new Set(sel.map((e) => e.id));
  const texts = api.getSceneElements().filter((e) => "containerId" in e && e.containerId && ids.has(e.containerId) && !ids.has(e.id));
  return [...sel, ...texts];
}

const inSelection = (e: ExcalidrawElement, ids: Readonly<Record<string, true | boolean>>) => !!(ids[e.id] || ("containerId" in e && e.containerId && ids[e.containerId]));

/** Shared value of `get` across `els`, or undefined when mixed. */
export function commonValue<E, T>(els: readonly E[], get: (e: E) => T): T | undefined {
  if (!els.length) return undefined;
  const v = get(els[0]);
  return els.every((e) => get(e) === v) ? v : undefined;
}


const rand = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Puts `base` back as the scene while keeping versions monotonic, so collaborators accept the rollback:
 * restored elements get a version above whatever is current, and elements that only exist now are deleted.
 */
export function rollbackScene(api: API, base: readonly ExcalidrawElement[]) {
  const cur = new Map(api.getSceneElementsIncludingDeleted().map((e) => [e.id, e]));
  const ids = new Set(base.map((e) => e.id));
  const bump = (e: ExcalidrawElement, v: number, extra: Partial<ExcalidrawElement> = {}) => ({ ...e, ...extra, version: v + 1, versionNonce: rand(), updated: Date.now() }) as ExcalidrawElement;
  const restored = base.map((b) => {
    const c = cur.get(b.id);
    return c && c.version >= b.version && c !== b ? bump(b, c.version) : b;
  });
  const removed = [...cur.values()].filter((c) => !ids.has(c.id) && !c.isDeleted).map((c) => bump(c, c.version, { isDeleted: true }));
  const out = [...restored, ...removed];
  api.updateScene({ elements: out, captureUpdate: "NEVER" });
  return out;
}

let previewBase: Map<string, ExcalidrawElement> | null = null;

/**
 * Patches the selected elements (and their bound text). "preview" skips history and remembers the originals,
 * so the following "immediate" call records a single undo step from the original state.
 */
export function updateSelected(
  api: API,
  patch: Partial<ExcalidrawElement> | ((e: ExcalidrawElement) => Partial<ExcalidrawElement> | null),
  appState?: Partial<AppState>,
  mode: "preview" | "immediate" = "immediate",
) {
  const { selectedElementIds } = api.getAppState();
  let scene = api.getSceneElementsIncludingDeleted() as ExcalidrawElement[];
  if (mode === "preview" && !previewBase) previewBase = new Map(scene.filter((e) => inSelection(e, selectedElementIds)).map((e) => [e.id, e]));
  if (mode === "immediate" && previewBase) {
    const base = previewBase;
    previewBase = null;
    scene = rollbackScene(api, scene.map((e) => base.get(e.id) ?? e));
  }
  const next = scene.map((e) => {
    if (!inSelection(e, selectedElementIds)) return e;
    const p = typeof patch === "function" ? patch(e) : patch;
    return p ? newElementWith(e, p as never) : e;
  });
  api.updateScene({ elements: next, appState: appState as AppState, captureUpdate: mode === "preview" ? "NEVER" : "IMMEDIATELY" });
}

/** Replaces each selected element with `fn(el)` (or keeps it when null). */
export function mapSelected(api: API, fn: (e: ExcalidrawElement) => ExcalidrawElement | null) {
  const { selectedElementIds } = api.getAppState();
  api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((e) => (selectedElementIds[e.id] ? (fn(e) ?? e) : e)), captureUpdate: "IMMEDIATELY" });
}

const commit = (api: API, elements: readonly ExcalidrawElement[], appState?: Partial<AppState>) => api.updateScene({ elements, appState: appState as AppState, captureUpdate: "IMMEDIATELY" });
const selectIds = (ids: Iterable<string>) => ({ selectedElementIds: Object.fromEntries([...ids].map((id) => [id, true])), selectedGroupIds: {} }) as Partial<AppState>;

/** Locks/unlocks the selection, including frame children and bound text. */
export function setLocked(api: API, locked: boolean) {
  const { selectedElementIds } = api.getAppState();
  const all = api.getSceneElementsIncludingDeleted();
  const ids = new Set(Object.keys(selectedElementIds).filter((k) => selectedElementIds[k]));
  const frames = new Set(all.filter((e) => ids.has(e.id) && e.type === "frame").map((e) => e.id));
  for (const e of all) if (!e.isDeleted && e.frameId && frames.has(e.frameId)) ids.add(e.id);
  for (const e of all) if ("containerId" in e && e.containerId && ids.has(e.containerId)) ids.add(e.id);
  if (ids.size) commit(api, all.map((e) => (ids.has(e.id) && e.locked !== locked ? newElementWith(e, { locked }) : e)));
}

export function reorder(api: API, to: "front" | "forward" | "backward" | "back") {
  const ids = new Set(selectedWithText(api).map((e) => e.id));
  const all = [...api.getSceneElementsIncludingDeleted()];
  const sel = all.filter((e) => ids.has(e.id));
  const rest = all.filter((e) => !ids.has(e.id));
  let out: ExcalidrawElement[];
  if (to === "front") out = [...rest, ...sel];
  else if (to === "back") out = [...sel, ...rest];
  else {
    const first = all.findIndex((e) => ids.has(e.id));
    const last = all.findLastIndex((e) => ids.has(e.id));
    const anchor = to === "forward" ? all.slice(last + 1).find((e) => !e.isDeleted && !ids.has(e.id)) : all.slice(0, first).findLast((e) => !e.isDeleted && !ids.has(e.id));
    if (!anchor) return;
    const i = rest.indexOf(anchor);
    out = to === "forward" ? [...rest.slice(0, i + 1), ...sel, ...rest.slice(i + 1)] : [...rest.slice(0, i), ...sel, ...rest.slice(i)];
  }
  commit(
    api,
    out.map((e) => (ids.has(e.id) ? newElementWith(e, {}, true) : e)),
  );
}

export function deleteSelected(api: API) {
  const ids = new Set(selectedWithText(api).map((e) => e.id));
  commit(
    api,
    api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)),
    { selectedElementIds: {} },
  );
}

export function groupSelected(api: API) {
  const ids = new Set(selectedWithText(api).map((e) => e.id));
  if (ids.size < 2) return;
  const g = uuid();
  commit(
    api,
    api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? newElementWith(e, { groupIds: [...e.groupIds, g] }) : e)),
    { selectedGroupIds: { [g]: true } },
  );
}

export function ungroupSelected(api: API) {
  const ids = new Set(selectedWithText(api).map((e) => e.id));
  commit(
    api,
    api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) && e.groupIds.length ? newElementWith(e, { groupIds: e.groupIds.slice(0, -1) }) : e)),
    { selectedGroupIds: {} },
  );
}

export function selectAll(api: API) {
  commit(api, api.getSceneElementsIncludingDeleted(), selectIds(api.getSceneElements().filter((e) => !e.locked && !("containerId" in e && e.containerId)).map((e) => e.id)));
}

export function clearCanvas(api: API) {
  commit(
    api,
    api.getSceneElementsIncludingDeleted().map((e) => newElementWith(e, { isDeleted: true })),
    { selectedElementIds: {} },
  );
}

export const toggleGrid = (api: API) => api.updateScene({ appState: { gridModeEnabled: !api.getAppState().gridModeEnabled } as AppState });

/** Wraps the selection in a new frame with 24px padding. */
export function wrapInFrame(api: API) {
  const els = selectedWithText(api).filter((e) => e.type !== "frame");
  if (!els.length) return;
  const xs = els.flatMap((e) => [e.x, e.x + e.width]);
  const ys = els.flatMap((e) => [e.y, e.y + e.height]);
  const x = Math.min(...xs) - 24;
  const y = Math.min(...ys) - 24;
  const [frame] = convertToExcalidrawElements([{ type: "frame", children: [], x, y, width: Math.max(...xs) + 24 - x, height: Math.max(...ys) + 24 - y } as never]);
  const ids = new Set(els.map((e) => e.id));
  const next = api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? newElementWith(e, { frameId: frame.id }) : e));
  const at = next.findIndex((e) => ids.has(e.id));
  commit(api, [...next.slice(0, at), frame, ...next.slice(at)], selectIds([frame.id]));
}

// ---------------- clipboard ----------------

const CLIP_TYPE = "draw/clipboard";
let memoryClip: string | null = null;

/** Copies of `els` with fresh ids (bindings, groups and containers remapped) shifted by dx/dy. */
function cloneElements(els: readonly ExcalidrawElement[], dx: number, dy: number) {
  const ids = new Map(els.map((e) => [e.id, uuid()]));
  const groups = new Map<string, string>();
  const group = (g: string) => (groups.has(g) || groups.set(g, uuid()), groups.get(g)!);
  return els.map((e) => {
    const c: Record<string, unknown> = {
      ...e,
      id: ids.get(e.id),
      x: e.x + dx,
      y: e.y + dy,
      seed: rand(),
      version: 1,
      versionNonce: rand(),
      updated: Date.now(),
      index: null,
      isDeleted: false,
      groupIds: e.groupIds.map(group),
      frameId: e.frameId && (ids.get(e.frameId) ?? e.frameId),
      boundElements: e.boundElements?.filter((b) => ids.has(b.id)).map((b) => ({ ...b, id: ids.get(b.id)! })) ?? null,
    };
    if ("containerId" in e) c.containerId = e.containerId ? (ids.get(e.containerId) ?? null) : null;
    for (const k of ["startBinding", "endBinding"] as const) {
      const b = (e as unknown as Record<string, { elementId: string } | null>)[k];
      if (b) c[k] = ids.has(b.elementId) ? { ...b, elementId: ids.get(b.elementId) } : null;
    }
    return c as unknown as ExcalidrawElement;
  });
}

function addAndSelect(api: API, els: ExcalidrawElement[], files?: Record<string, BinaryFileData>) {
  if (files) api.addFiles(Object.values(files));
  commit(api, [...api.getSceneElementsIncludingDeleted(), ...els], selectIds(els.filter((e) => !("containerId" in e && e.containerId)).map((e) => e.id)));
}

export async function copySelection(api: API) {
  const els = selectedWithText(api);
  if (!els.length) return;
  const all = api.getFiles();
  const files = Object.fromEntries(els.flatMap((e) => (e.type === "image" && e.fileId && all[e.fileId] ? [[e.fileId, all[e.fileId]]] : [])));
  memoryClip = JSON.stringify({ type: CLIP_TYPE, elements: els, files });
  // the in-memory copy is enough for pasting inside the app; the system clipboard is best effort
  await navigator.clipboard?.writeText(memoryClip).catch(() => {});
}

export async function cutSelection(api: API) {
  await copySelection(api);
  deleteSelected(api);
}

/** Pastes copied elements with their top-left at `at`. Returns false when the clipboard has none. */
export async function pasteAt(api: API, at: { x: number; y: number }) {
  let text = memoryClip;
  try {
    text = (await navigator.clipboard.readText()) || text;
  } catch {
    /* permission denied: use the in-memory copy */
  }
  if (!text) return false;
  try {
    const data = JSON.parse(text) as { type?: string; elements?: ExcalidrawElement[]; files?: Record<string, BinaryFileData> };
    if (data.type !== CLIP_TYPE || !data.elements?.length) return false;
    const minX = Math.min(...data.elements.map((e) => e.x));
    const minY = Math.min(...data.elements.map((e) => e.y));
    addAndSelect(api, cloneElements(data.elements, at.x - minX, at.y - minY), data.files);
    return true;
  } catch {
    return false;
  }
}

export function duplicateSelection(api: API) {
  const els = selectedWithText(api);
  if (els.length) addAndSelect(api, cloneElements(els, 16, 16));
}

const STYLE_KEYS = ["strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity"] as const;
let copiedStyle: Partial<ExcalidrawElement> | null = null;
export function copyStyle(api: API) {
  const el = selectedEls(api)[0];
  if (el) copiedStyle = Object.fromEntries(STYLE_KEYS.map((k) => [k, el[k]]));
}
export const hasCopiedStyle = () => copiedStyle !== null;
export function pasteStyle(api: API) {
  if (!copiedStyle) return;
  const style = copiedStyle;
  const ids = new Set(selectedWithText(api).map((e) => e.id));
  commit(
    api,
    api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? newElementWith(e, style as never) : e)),
  );
}

/** Copies the selection as PNG; without the async Clipboard API (plain HTTP) it downloads the PNG instead. Returns whether it was copied. */
export async function copyAsPng(api: API) {
  const appState = { ...api.getAppState(), exportBackground: true };
  const blob = withNodeSnapshots(selectedWithText(api), api.getFiles()).then((s) => exportToBlob({ elements: s.elements, appState, files: s.files, mimeType: "image/png" }));
  if (canWriteClipboardImage()) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  }
  const url = URL.createObjectURL(await blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "selection.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return false;
}

export async function copyAsSvg(api: API) {
  const s = await withNodeSnapshots(selectedWithText(api), api.getFiles());
  const svg = await exportToSvg({ elements: s.elements, appState: { ...api.getAppState(), exportBackground: false }, files: s.files });
  if (!(await copyText(svg.outerHTML))) throw new Error("复制失败");
}

// ---------------- Excalidraw action bridge ----------------

type ActionManager = { actions: Record<string, unknown>; executeAction: (action: unknown, source: string, value?: unknown) => void };
const bridged = new WeakMap<API, { actionManager: ActionManager }>();

/**
 * Captures Excalidraw's internal app (and its action manager) through a no-op action's keyTest,
 * so built-in actions such as changeFontSize can be run with their own text re-measuring logic.
 */
export function installActionBridge(api: API, root: HTMLElement) {
  if (bridged.has(api)) return;
  api.registerAction({
    name: "draw:bridge",
    label: "draw:bridge",
    trackEvent: false,
    keyTest: (_a: unknown, _s: unknown, _e: unknown, app: { actionManager: ActionManager }) => {
      bridged.set(api, app);
      return false;
    },
    perform: () => false,
  } as never);
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "Unidentified", bubbles: true }));
}

export function runAction(api: API, name: string, value?: unknown) {
  const am = bridged.get(api)?.actionManager;
  const action = am?.actions[name];
  if (!am || !action) return false;
  am.executeAction(action, "ui", value);
  return true;
}

// ---------------- color scheme (base color + fill mode) ----------------

export type FillMode = "light" | "solid" | "none";

function lighten(hex: string, t = 0.75) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
function luminance(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastText = (bg: string) => {
  const c = bg.toLowerCase();
  return c === "transparent" || !/^#[0-9a-f]{6}$/.test(c) || luminance(c) > 0.45 ? "#1e1e1e" : "#ffffff";
};

/** Base (palette) color of a shape: customData.color, else its stroke. */
export const baseColor = (e: ExcalidrawElement) => (((e.customData as { color?: string } | undefined)?.color ?? e.strokeColor) as string).toLowerCase();
export function fillMode(e: ExcalidrawElement): FillMode {
  const bg = e.backgroundColor.toLowerCase();
  return bg === "transparent" ? "none" : bg === baseColor(e) ? "solid" : "light";
}
export const fillFor = (base: string, mode: FillMode) => (mode === "none" ? "transparent" : mode === "solid" ? base : (PALETTE.find((p) => p.stroke === base)?.light ?? lighten(base)));

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Applies base color / fill mode / overrides to selected shapes and recolors their bound text for contrast. */
function applyScheme(api: API, fn: (e: ExcalidrawElement) => { base: string; mode: FillMode; customData: Record<string, unknown> }, appState: Partial<AppState>, mode: "preview" | "immediate") {
  const { selectedElementIds } = api.getAppState();
  const next = new Map<string, { stroke: string; background: string; text: string; customData: Record<string, unknown> }>();
  for (const e of api.getSceneElements()) {
    if (!selectedElementIds[e.id] || e.type === "text") continue;
    const { base, mode: m, customData } = fn(e);
    const background = fillFor(base, m);
    next.set(e.id, { stroke: (customData.outlineColor as string) ?? base, background, text: (customData.textColor as string) ?? contrastText(background), customData });
  }
  updateSelected(
    api,
    (e) => {
      if (e.type === "text") {
        const c = "containerId" in e && e.containerId ? next.get(e.containerId) : undefined;
        return c ? { strokeColor: c.text } : null;
      }
      const c = next.get(e.id);
      return c ? ({ strokeColor: c.stroke, backgroundColor: c.background, fillStyle: "solid", customData: c.customData } as Partial<ExcalidrawElement>) : null;
    },
    appState,
    mode,
  );
}

const firstShape = (api: API) => {
  const { selectedElementIds } = api.getAppState();
  return api.getSceneElements().find((e) => selectedElementIds[e.id] && e.type !== "text");
};

export function setBaseColor(api: API, color: string, mode: "preview" | "immediate" = "immediate") {
  const f = firstShape(api);
  applyScheme(api, (e) => ({ base: color, mode: fillMode(e), customData: clean({ ...e.customData, color }) }), { currentItemStrokeColor: color, currentItemBackgroundColor: fillFor(color, f ? fillMode(f) : "light") }, mode);
}
export function setFillMode(api: API, m: FillMode) {
  const f = firstShape(api);
  applyScheme(api, (e) => ({ base: baseColor(e), mode: m, customData: clean({ ...e.customData }) }), { currentItemFillStyle: "solid", currentItemBackgroundColor: fillFor(f ? baseColor(f) : DEFAULT_STROKE, m) }, "immediate");
}
export function setOutlineColor(api: API, color: string, mode: "preview" | "immediate" = "immediate") {
  const v = color === "auto" ? undefined : color === "none" ? "transparent" : color;
  applyScheme(api, (e) => ({ base: baseColor(e), mode: fillMode(e), customData: clean({ ...e.customData, color: baseColor(e), outlineColor: v }) }), {}, mode);
}
export function setTextColorOverride(api: API, color: string, mode: "preview" | "immediate" = "immediate") {
  const v = color === "auto" ? undefined : color;
  applyScheme(api, (e) => ({ base: baseColor(e), mode: fillMode(e), customData: clean({ ...e.customData, color: baseColor(e), textColor: v }) }), {}, mode);
}
/** Stroke color for non-shape selections (lines, arrows, freedraw). */
export function setStrokeColor(api: API, color: string, mode: "preview" | "immediate" = "immediate") {
  updateSelected(api, { strokeColor: color }, { currentItemStrokeColor: color }, mode);
}

// ---------------- custom node data (live preview from side panels) ----------------

const nodePreviewBase = new Map<string, ExcalidrawElement>();

/** Merges `patch` into a node's customData. "preview" skips history; "immediate" commits one undo step from before the preview. */
export function updateNodeData(api: API, id: string, patch: Record<string, unknown>, mode: "preview" | "immediate" = "immediate", extra: Partial<ExcalidrawElement> = {}) {
  let scene: readonly ExcalidrawElement[] = api.getSceneElementsIncludingDeleted();
  const el = scene.find((e) => e.id === id);
  if (!el) return;
  if (el.isDeleted) {
    nodePreviewBase.delete(id);
    return;
  }
  if (mode === "preview" && !nodePreviewBase.has(id)) nodePreviewBase.set(id, el);
  const base = mode === "immediate" ? nodePreviewBase.get(id) : undefined;
  if (base) {
    nodePreviewBase.delete(id);
    scene = rollbackScene(api, scene.map((e) => (e.id === id ? base : e)));
  }
  const cur = scene.find((e) => e.id === id)!;
  api.updateScene({
    elements: scene.map((e) => (e.id === id ? newElementWith(e, { customData: { ...el.customData, ...patch }, height: cur.height, ...extra } as never) : e)),
    captureUpdate: mode === "preview" ? "NEVER" : "IMMEDIATELY",
  });
}

/** Restores a node to its state before an uncommitted preview. */
export function cancelNodePreview(api: API, id: string) {
  const base = nodePreviewBase.get(id);
  if (!base) return;
  nodePreviewBase.delete(id);
  const scene = api.getSceneElementsIncludingDeleted();
  if (scene.find((e) => e.id === id)?.isDeleted === false) rollbackScene(api, scene.map((e) => (e.id === id ? base : e)));
}

// ---------------- text → node conversion ----------------

/** Replaces a standalone text element with a node built from its text, keeping position, groups and frame. */
export function convertText(api: API, id: string, build: (text: string, width: number) => ExcalidrawElement) {
  const scene = api.getSceneElementsIncludingDeleted();
  const t = scene.find((e) => e.id === id);
  if (!t || t.type !== "text" || t.containerId) return null;
  const node = { ...build(t.originalText, t.width), x: t.x, y: t.y, groupIds: t.groupIds, frameId: t.frameId } as ExcalidrawElement;
  api.updateScene({
    elements: [...scene.map((e) => (e.id === id ? newElementWith(e, { isDeleted: true }) : e)), node],
    appState: { selectedElementIds: { [node.id]: true } } as never,
    captureUpdate: "IMMEDIATELY",
  });
  return node.id;
}
