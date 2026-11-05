import { convertToExcalidrawElements, exportToBlob, newElementWith, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { CHART_TYPES, type ChartConfig, type ChartType } from "./chart";
import { CODE_BLOCK_LANGUAGES, codeBlockSize, createCodeBlock } from "./codeblock";
import { diagramOf, place, renderDiagram } from "./diagram";
import { svgToDataUrl } from "./left-toolbar";
import { makeLinkCard } from "./node-bars";
import { withNodeSnapshots } from "./node-overlays";
import { fillFor, PALETTE, runAction, type FillMode } from "./ops";
import type { Stack } from "./sandbox";
import { createEmbeddable, createNode, nodeKind, type API } from "./scene";
import { SHAPES, convertShape, shapeOf } from "./shapes";

/** Usage notes shown by `window.draw.help()` (also handy for AI agents driving the canvas). */
export const AUTOMATION_HELP = `Draw 画布自动化接口（window.draw）。坐标为场景坐标（左上角 x/y），所有修改一次调用 = 一条撤销记录。
- info()：画布概况 + 可用枚举（shapes / colors / chartTypes / codeLanguages / codeStacks）
- elements({ids,type,kind}) / get(id)：元素摘要（id、类型、位置尺寸、文字、颜色、连线端点、图表数据）
- add(specs, {select?, fit?, roughness?: 0|1|2}) → Promise<id[]>：批量添加（按传入顺序叠放），spec.type 可为
    shape   { shape?, x, y, width?, height?, text?, color?, fill?: light|solid|none, stroke?: solid|dashed|dotted, fontSize?, font?: clean|hand|mono }
    text    { text, x, y, fontSize?, color?, align?, font? }
    arrow / line { from?: id, to?: id, points?: [[x,y]...], label?, color?, stroke?, startArrowhead?, endArrowhead? }
    frame   { name?, children?: id[], x?, y?, width?, height?, padding?, status?: { label, tone?, animation? } }
    code    { code, language?, x, y, fontSize? }
    link    { url, x, y, width? }
    markdown { markdown, x, y, width? }
    chart   { chartType, labels, series: [{name, values}], x, y, width?, height?, options?: {title, legend, palette, dataLabels, stacked, ...} }
    mermaid { code, x?, y? }
    icon    { icon: "lucide:database", x, y, size?, color? }
    image   { src, x, y, width?, height? }
    iframe  { url, x, y, width?, height? }
    sandbox { stack?, code?, x, y, width?, height? }
  每个 spec 可带自定义 id（画布内唯一），供 arrow 的 from/to 与后续 update 引用；from/to 可引用本批或画布已有元素。
- update(id, patch)：x y width height angle text color fill textColor stroke strokeWidth fontSize opacity locked link name code language markdown chart sandboxCode stack
- move(ids, dx, dy) / remove(ids) / clear({confirm:true}) / select(ids) / fit(ids?) / undo() / redo()
- suggestPosition(w, h)：已有内容右侧的空白位置
- exportPng({area}) → dataURL
- exportCover({width?, height?}) → dataURL：封面缩略图（默认 640×360）`;

type Spec = Record<string, unknown> & { type: string; id?: string };
type Box = { x: number; y: number; width: number; height: number };
const FONT = { clean: 2, hand: 5, mono: 3 } as Record<string, number>;
const STROKES = ["solid", "dashed", "dotted"];
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

function colorOf(name: unknown) {
  if (name === undefined || name === null || name === "default") return PALETTE[0];
  const s = String(name);
  const p = PALETTE.find((c) => c.id === s);
  if (p) return p;
  if (/^#[0-9a-f]{6}$/i.test(s)) return { id: s, label: s, stroke: s.toLowerCase(), light: fillFor(s.toLowerCase(), "light") };
  throw new Error(`未知颜色「${s}」，可用：${PALETTE.map((c) => c.id).join(", ")} 或 #rrggbb`);
}

function summary(e: ExcalidrawElement, all: readonly ExcalidrawElement[]) {
  const out: Record<string, unknown> = { id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), width: Math.round(e.width), height: Math.round(e.height) };
  const kind = nodeKind(e as never);
  if (kind) out.kind = kind;
  const shape = shapeOf(e);
  if (shape) out.shape = shape;
  if (e.angle) out.angle = e.angle;
  if (e.locked) out.locked = true;
  if (e.type === "text") out.text = e.text;
  const label = e.boundElements?.find((b) => b.type === "text");
  const labelEl = label && all.find((x) => x.id === label.id);
  if (labelEl && labelEl.type === "text") out.text = labelEl.text;
  if (e.strokeColor !== "transparent") out.color = e.strokeColor;
  if (e.type === "arrow") {
    out.from = e.startBinding?.elementId ?? null;
    out.to = e.endBinding?.elementId ?? null;
  }
  if (e.type === "frame") out.name = e.name;
  const d = e.customData as Record<string, unknown> | undefined;
  if (kind === "chart") out.chart = d?.chart;
  if (kind === "markdown") out.markdown = d?.source;
  if (kind === "codeblock") Object.assign(out, { code: d?.code, language: d?.language });
  if (kind === "link") out.url = d?.url;
  if (kind === "code") Object.assign(out, { stack: d?.stack, code: d?.code });
  const diagram = diagramOf(e);
  if (diagram) out.diagram = diagram.id;
  if (e.groupIds.length) out.groupIds = e.groupIds;
  if (e.frameId) out.frameId = e.frameId;
  return out;
}

function bounds(els: readonly Box[]) {
  const xs = els.flatMap((e) => [e.x, e.x + e.width]);
  const ys = els.flatMap((e) => [e.y, e.y + e.height]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/** Point where the ray from the box center toward `to` leaves the box. */
function edgePoint(b: Box, to: { x: number; y: number }) {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? b.width / 2 / Math.abs(dx) : Infinity, dy ? b.height / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

const toChartType = (t: unknown): ChartType => {
  const s = String(t ?? "bar") as ChartType;
  if (!CHART_TYPES.some((c) => c.value === s)) throw new Error(`未知图表类型「${s}」，可用：${CHART_TYPES.map((c) => c.value).join(", ")}`);
  return s;
};

async function fileFromSrc(src: string): Promise<BinaryFileData> {
  const blob = await fetch(src).then((r) => {
    if (!r.ok) throw new Error(`图片加载失败：${src.slice(0, 80)}`);
    return r.blob();
  });
  const dataURL = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("图片读取失败"));
    fr.readAsDataURL(blob);
  });
  return { id: crypto.randomUUID(), mimeType: blob.type || "image/png", dataURL, created: Date.now() } as BinaryFileData;
}

export function createAutomation(api: API, opts: { readOnly: boolean; stacks: () => Stack[] }) {
  const guard = () => {
    if (opts.readOnly) throw new Error("当前画布为只读，不能修改");
  };
  const scene = () => api.getSceneElementsIncludingDeleted();
  const live = () => api.getSceneElements();
  const find = (id: string) => {
    const e = live().find((x) => x.id === id);
    if (!e) throw new Error(`元素「${id}」不存在`);
    return e;
  };
  const commit = (elements: readonly ExcalidrawElement[], appState?: Record<string, unknown>) => api.updateScene({ elements, appState: appState as never, captureUpdate: "IMMEDIATELY" });

  /** Builds the elements for one spec (async parts resolved). `ids` maps spec ids → created element ids. */
  async function build(spec: Spec, ids: Map<string, string>, created: ExcalidrawElement[], files: BinaryFileData[], roughness: number) {
    const x = num(spec.x, 0);
    const y = num(spec.y, 0);
    const withId = (el: ExcalidrawElement) => ({ ...el, id: spec.id ?? el.id }) as ExcalidrawElement;
    switch (spec.type) {
      case "shape": {
        const shape = str(spec.shape, "rectangle");
        if (!SHAPES.some((s) => s.id === shape)) throw new Error(`未知形状「${shape}」，可用：${SHAPES.map((s) => s.id).join(", ")}`);
        const c = colorOf(spec.color);
        const fill = str(spec.fill, "light") as FillMode;
        const def = SHAPES.find((s) => s.id === shape)!;
        const [w, h] = def.size ?? [160, 100];
        const stroke = str(spec.stroke, "solid");
        const skeleton: Record<string, unknown> = {
          type: "rectangle",
          x,
          y,
          width: num(spec.width, w),
          height: num(spec.height, h),
          strokeColor: c.stroke,
          backgroundColor: fillFor(c.stroke, fill),
          fillStyle: "solid",
          strokeStyle: STROKES.includes(stroke) ? stroke : "solid",
          roughness,
          customData: { color: c.stroke },
        };
        if (spec.text && def.native) Object.assign(skeleton, { type: def.native, roundness: def.rounded ? { type: 3 } : null, label: { text: String(spec.text), fontSize: num(spec.fontSize, 20), fontFamily: FONT[str(spec.font, "clean")] ?? 2, strokeColor: fill === "solid" ? "#ffffff" : "#1e1e1e" } });
        const els = convertToExcalidrawElements([skeleton as never]);
        const main = def.native && spec.text ? els[0] : convertShape(els[0], shape);
        return [withId(main), ...els.slice(1).map((t) => ({ ...t, containerId: spec.id ?? main.id }) as unknown as ExcalidrawElement)].map((e, i, arr) =>
          i === 0 && arr.length > 1 ? ({ ...e, boundElements: [{ type: "text", id: arr[1].id }] } as ExcalidrawElement) : e,
        );
      }
      case "text": {
        const c = colorOf(spec.color);
        const [t] = convertToExcalidrawElements([{ type: "text", x, y, text: str(spec.text), fontSize: num(spec.fontSize, 24), fontFamily: FONT[str(spec.font, "clean")] ?? 2, textAlign: str(spec.align, "left"), strokeColor: c.stroke } as never]);
        return [withId(t)];
      }
      case "arrow":
      case "line": {
        const c = colorOf(spec.color);
        const resolve = (ref: unknown) => {
          if (typeof ref !== "string") return null;
          const id = ids.get(ref) ?? ref;
          return created.find((e) => e.id === id) ?? live().find((e) => e.id === id) ?? null;
        };
        const from = resolve(spec.from);
        const to = resolve(spec.to);
        let pts: [number, number][];
        if (Array.isArray(spec.points) && spec.points.length >= 2) pts = spec.points as [number, number][];
        else if (from && to) {
          const a = edgePoint(from, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
          const b = edgePoint(to, { x: from.x + from.width / 2, y: from.y + from.height / 2 });
          pts = [
            [a.x, a.y],
            [b.x, b.y],
          ];
        } else throw new Error("arrow / line 需要 points 或 from + to");
        const [ox, oy] = pts[0];
        const isArrow = spec.type === "arrow";
        const stroke = str(spec.stroke, "solid");
        const skeleton = {
          type: spec.type,
          x: ox,
          y: oy,
          points: pts.map(([px, py]) => [px - ox, py - oy]),
          strokeColor: c.stroke,
          strokeWidth: 2,
          strokeStyle: STROKES.includes(stroke) ? stroke : "solid",
          roughness,
          ...(isArrow ? { startArrowhead: (spec.startArrowhead as string) ?? null, endArrowhead: (spec.endArrowhead as string) ?? "arrow" } : {}),
          ...(spec.label ? { label: { text: String(spec.label), fontSize: 16 } } : {}),
        };
        const els = convertToExcalidrawElements([skeleton as never]);
        const binding = (el: ExcalidrawElement | null) => (el && isArrow ? { elementId: el.id, focus: 0, gap: 4, fixedPoint: null } : null);
        const line = withId({ ...els[0], startBinding: binding(from), endBinding: binding(to) } as ExcalidrawElement);
        return [line, ...els.slice(1).map((t) => ({ ...t, containerId: line.id }) as unknown as ExcalidrawElement)];
      }
      case "frame": {
        const children = (Array.isArray(spec.children) ? spec.children : []).map((r) => {
          const id = ids.get(String(r)) ?? String(r);
          return created.find((e) => e.id === id) ?? live().find((e) => e.id === id);
        }).filter(Boolean) as ExcalidrawElement[];
        const pad = num(spec.padding, 24);
        const box = children.length ? bounds(children) : { x, y, width: num(spec.width, 480), height: num(spec.height, 320) };
        const [f] = convertToExcalidrawElements([{ type: "frame", children: [], x: box.x - (children.length ? pad : 0), y: box.y - (children.length ? pad : 0), width: box.width + (children.length ? pad * 2 : 0), height: box.height + (children.length ? pad * 2 : 0), name: spec.name ? String(spec.name) : null } as never]);
        const status = spec.status as { label?: string; tone?: string; status?: string; animation?: boolean } | undefined;
        const frame = withId({ ...f, customData: status?.label ? { status: { label: status.label, tone: status.tone ?? status.status ?? "primary", animation: !!status.animation } } : undefined } as ExcalidrawElement);
        for (const ch of children) {
          const i = created.indexOf(ch);
          if (i >= 0) created[i] = { ...ch, frameId: frame.id } as ExcalidrawElement;
          else created.push({ ...newElementWith(ch, { frameId: frame.id }) } as ExcalidrawElement);
        }
        return [frame];
      }
      case "code": {
        const lang = str(spec.language, "auto");
        if (!CODE_BLOCK_LANGUAGES.some((l) => l.value === lang)) throw new Error(`未知代码语言「${lang}」，可用：${CODE_BLOCK_LANGUAGES.map((l) => l.value).join(", ")}`);
        const el = createCodeBlock(str(spec.code), num(spec.fontSize, 14), lang);
        return [withId({ ...el, x, y })];
      }
      case "link": {
        const card = await makeLinkCard(str(spec.url));
        return [withId({ ...card, x, y, width: num(spec.width, card.width) })];
      }
      case "markdown": {
        const el = createNode("markdown", num(spec.width, 480), 120, { source: str(spec.markdown) });
        return [withId({ ...el, x, y })];
      }
      case "chart": {
        const type = toChartType(spec.chartType);
        const o = (spec.options ?? {}) as Partial<ChartConfig> & { showTitle?: boolean };
        const series = ((spec.series as { name?: string; values?: number[] }[]) ?? []).map((s, i) => ({ name: s.name ?? `系列 ${i + 1}`, data: (s.values ?? []).map((v) => Number(v) || 0) }));
        const chart: ChartConfig = { type, labels: ((spec.labels as string[]) ?? []).map(String), series, palette: o.palette ?? "default", legend: o.legend ?? "top", title: o.showTitle === false ? "" : o.title, ...o };
        const el = createNode("chart", num(spec.width, type === "pie" || type === "donut" || type === "radar" ? 400 : 480), num(spec.height, 300), { chart });
        return [withId({ ...el, x, y })];
      }
      case "mermaid": {
        const r = await renderDiagram(str(spec.code));
        const data = { id: spec.id ?? crypto.randomUUID(), code: str(spec.code) };
        files.push(...(Object.values(r.files) as BinaryFileData[]));
        return place(r, data, { x, y });
      }
      case "icon": {
        const c = colorOf(spec.color);
        const dataURL = await svgToDataUrl(str(spec.icon), c.stroke);
        const fileId = crypto.randomUUID();
        files.push({ id: fileId, mimeType: "image/svg+xml", dataURL, created: Date.now() } as BinaryFileData);
        const size = num(spec.size, 64);
        const [img] = convertToExcalidrawElements([{ type: "image", fileId, x, y, width: size, height: size } as never]);
        return [withId({ ...img, status: "saved" } as ExcalidrawElement)];
      }
      case "image": {
        const file = await fileFromSrc(str(spec.src));
        files.push(file);
        const dims = await new Promise<{ w: number; h: number }>((res) => {
          const im = new Image();
          im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => res({ w: 320, h: 240 });
          im.src = file.dataURL;
        });
        const width = num(spec.width, Math.min(dims.w, 640));
        const height = num(spec.height, (width * dims.h) / dims.w);
        const [img] = convertToExcalidrawElements([{ type: "image", fileId: file.id, x, y, width, height } as never]);
        return [withId({ ...img, status: "saved" } as ExcalidrawElement)];
      }
      case "iframe": {
        const el = createEmbeddable(str(spec.url), num(spec.width, 720), num(spec.height, 450));
        return [withId({ ...el, x, y })];
      }
      case "sandbox": {
        const stacks = opts.stacks().filter((s) => s.enabled);
        if (!stacks.length) throw new Error("没有可用的技术方案");
        const stack = spec.stack ? stacks.find((s) => s.key === spec.stack) : stacks[0];
        if (!stack) throw new Error(`未知的技术方案「${String(spec.stack)}」，可用：${stacks.map((s) => s.key).join(", ")}`);
        const el = createNode("code", num(spec.width, 640), num(spec.height, 420), { stack: stack.key, code: str(spec.code, stack.starter ?? "") });
        return [withId({ ...el, x, y })];
      }
    }
    throw new Error(`未知元素类型「${spec.type}」`);
  }

  return {
    help: () => AUTOMATION_HELP,
    info() {
      const els = live();
      const b = els.length ? bounds(els) : null;
      return {
        elementCount: els.length,
        bounds: b && { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) },
        readOnly: opts.readOnly,
        selected: Object.keys(api.getAppState().selectedElementIds),
        enums: {
          shapes: SHAPES.map((s) => s.id),
          colors: PALETTE.map((c) => c.id),
          chartTypes: CHART_TYPES.map((c) => c.value),
          codeLanguages: CODE_BLOCK_LANGUAGES.map((l) => l.value),
          codeStacks: opts.stacks().filter((s) => s.enabled).map((s) => ({ key: s.key, name: s.name, runtime: s.runtime })),
          fonts: Object.keys(FONT),
        },
      };
    },
    elements(filter: { ids?: string[]; type?: string; kind?: string } = {}) {
      const all = live();
      return all
        .filter((e) => !("containerId" in e && e.containerId))
        .filter((e) => (!filter.ids || filter.ids.includes(e.id)) && (!filter.type || e.type === filter.type) && (!filter.kind || nodeKind(e as never) === filter.kind))
        .map((e) => summary(e, all));
    },
    get(id: string) {
      return summary(find(id), live());
    },
    async add(specs: Spec | Spec[], o: { select?: boolean; fit?: boolean; roughness?: number } = {}) {
      guard();
      const list = Array.isArray(specs) ? specs : [specs];
      const existing = new Set(scene().map((e) => e.id));
      const ids = new Map<string, string>();
      const created: ExcalidrawElement[] = [];
      const files: BinaryFileData[] = [];
      const top: string[] = [];
      for (const spec of list) {
        if (spec.id && (existing.has(spec.id) || ids.has(spec.id))) throw new Error(`id「${spec.id}」已存在，请换一个或省略 id`);
        const els = await build(spec, ids, created, files, num(o.roughness, 1));
        if (spec.id) ids.set(spec.id, els[0].id);
        top.push(els[0].id);
        created.push(...els);
      }
      // bind arrows into their endpoints
      const byId = new Map(created.map((e) => [e.id, e]));
      const extraBound = new Map<string, { id: string; type: "arrow" }[]>();
      for (const a of created) {
        if (a.type !== "arrow") continue;
        for (const b of [a.startBinding, a.endBinding]) {
          if (!b) continue;
          const target = byId.get(b.elementId);
          if (target) byId.set(target.id, { ...target, boundElements: [...(target.boundElements ?? []), { id: a.id, type: "arrow" }] } as ExcalidrawElement);
          else extraBound.set(b.elementId, [...(extraBound.get(b.elementId) ?? []), { id: a.id, type: "arrow" }]);
        }
      }
      const out = created.map((e) => byId.get(e.id) ?? e);
      const outIds = new Set(out.map((e) => e.id));
      if (files.length) api.addFiles(files);
      const base = scene()
        .filter((e) => !outIds.has(e.id))
        .map((e) => (extraBound.has(e.id) ? newElementWith(e, { boundElements: [...(e.boundElements ?? []), ...extraBound.get(e.id)!] }) : e));
      const replaced = out.filter((e) => existing.has(e.id));
      const fresh = out.filter((e) => !existing.has(e.id));
      commit(
        [...base.map((e) => replaced.find((r) => r.id === e.id) ?? e), ...fresh],
        o.select ? { selectedElementIds: Object.fromEntries(top.map((id) => [id, true])) } : undefined,
      );
      if (o.fit) api.scrollToContent(out, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
      return top;
    },
    update(id: string, patch: Record<string, unknown>) {
      guard();
      const el = find(id);
      const p: Record<string, unknown> = {};
      const data: Record<string, unknown> = {};
      for (const k of ["x", "y", "width", "height", "angle", "strokeWidth", "opacity", "locked", "link", "name"]) if (k in patch) p[k] = patch[k];
      if ("color" in patch) {
        const c = colorOf(patch.color);
        p.strokeColor = c.stroke;
        if (shapeOf(el)) {
          p.backgroundColor = fillFor(c.stroke, (str(patch.fill) as FillMode) || (el.backgroundColor === "transparent" ? "none" : "light"));
          data.color = c.stroke;
        }
      } else if ("fill" in patch) p.backgroundColor = fillFor(el.strokeColor, str(patch.fill) as FillMode);
      if ("stroke" in patch) p.strokeStyle = patch.stroke;
      if ("code" in patch || "language" in patch) {
        if ("code" in patch) data.code = String(patch.code);
        if ("language" in patch) data.language = String(patch.language);
        if (nodeKind(el as never) === "codeblock") Object.assign(p, codeBlockSize(String(data.code ?? (el.customData as { code?: string })?.code ?? ""), Number((el.customData as { fontSize?: number })?.fontSize ?? 14), el.width));
      }
      if ("markdown" in patch) data.source = String(patch.markdown);
      if ("chart" in patch) data.chart = { ...(el.customData as { chart?: ChartConfig })?.chart, ...(patch.chart as object) };
      if ("sandboxCode" in patch) data.code = String(patch.sandboxCode);
      if ("stack" in patch) data.stack = String(patch.stack);
      if (Object.keys(data).length) p.customData = { ...el.customData, ...data };
      const all = scene();
      const label = el.boundElements?.find((b) => b.type === "text");
      const textTarget = el.type === "text" ? el : label ? all.find((e) => e.id === label.id) : undefined;
      const textPatch: Record<string, unknown> = {};
      if ("text" in patch && textTarget) Object.assign(textPatch, { text: String(patch.text), originalText: String(patch.text) });
      if ("fontSize" in patch && textTarget) textPatch.fontSize = patch.fontSize;
      if ("textColor" in patch && textTarget) textPatch.strokeColor = colorOf(patch.textColor).stroke;
      const next = all.map((e) => {
        if (e.id === id) return newElementWith(e, { ...p, ...(textTarget?.id === id ? textPatch : {}) } as never);
        if (textTarget && e.id === textTarget.id) return newElementWith(e, textPatch as never);
        return e;
      });
      // re-measure changed text so its box matches the new content
      const measured = Object.keys(textPatch).length && textTarget ? new Map(restoreElements(next.filter((e) => e.id === textTarget.id), null, { refreshDimensions: true }).map((e) => [e.id, e])) : null;
      commit(measured ? next.map((e) => measured.get(e.id) ?? e) : next);
      return summary(find(id), live());
    },
    move(idsIn: string | string[], dx: number, dy: number) {
      guard();
      const ids = new Set(Array.isArray(idsIn) ? idsIn : [idsIn]);
      const all = scene();
      for (const e of all) if ("containerId" in e && e.containerId && ids.has(e.containerId)) ids.add(e.id);
      commit(all.map((e) => (ids.has(e.id) ? newElementWith(e, { x: e.x + dx, y: e.y + dy }) : e)));
    },
    remove(idsIn: string | string[]) {
      guard();
      const ids = new Set(Array.isArray(idsIn) ? idsIn : [idsIn]);
      const all = scene();
      for (const e of all) if ("containerId" in e && e.containerId && ids.has(e.containerId)) ids.add(e.id);
      commit(all.map((e) => (ids.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)), { selectedElementIds: {} });
    },
    clear(o: { confirm?: boolean } = {}) {
      guard();
      if (!o.confirm) throw new Error("清空画布需要传入 { confirm: true }");
      commit(scene().map((e) => newElementWith(e, { isDeleted: true })), { selectedElementIds: {} });
    },
    select(idsIn: string | string[]) {
      const ids = Array.isArray(idsIn) ? idsIn : [idsIn];
      api.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } as never, captureUpdate: "NEVER" });
    },
    fit(ids?: string[]) {
      const els = ids ? live().filter((e) => ids.includes(e.id)) : undefined;
      api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
    },
    undo: () => (guard(), runAction(api, "undo")),
    redo: () => (guard(), runAction(api, "redo")),
    suggestPosition(w = 400, h = 300) {
      const els = live();
      if (!els.length) return { x: 0, y: 0 };
      const b = bounds(els);
      return { x: Math.round(b.x + b.width + 80), y: Math.round(b.y + Math.max(0, (b.height - h) / 2)), width: w, height: h };
    },
    async exportPng(o: { area?: "canvas" | "selection" } = {}) {
      const sel = api.getAppState().selectedElementIds;
      const els = o.area === "selection" ? live().filter((e) => sel[e.id]) : live();
      const s = await withNodeSnapshots(els, api.getFiles());
      const blob = await exportToBlob({ elements: s.elements, appState: { ...api.getAppState(), exportBackground: true }, files: s.files as BinaryFiles, mimeType: "image/png" });
      return blobToDataUrl(blob);
    },
    async exportCover(o: { width?: number; height?: number } = {}) {
      const width = num(o.width, 640);
      const height = num(o.height, 360);
      const s = await withNodeSnapshots(live(), api.getFiles(), 1);
      const blob = await exportToBlob({
        elements: s.elements,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
        files: s.files as BinaryFiles,
        mimeType: "image/png",
        exportPadding: 32,
        getDimensions: (w: number, h: number) => {
          const scale = Math.min(2, width / w, height / h) || 1;
          return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
        },
      });
      return blobToDataUrl(blob);
    },
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
