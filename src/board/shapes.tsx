import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { viewportCenter, type API } from "./scene";

/** Shape library: native Excalidraw shapes plus polygons stored as closed `line` elements (customData.shape). */
export type ShapeDef = { id: string; label: string; d: string; native?: "rectangle" | "ellipse" | "diamond"; rounded?: boolean; open?: boolean; size?: [number, number] };

function starPath() {
  return `M${Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 20;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(52 + r * Math.sin(a)).toFixed(2)}`;
  }).join("L")}Z`;
}

export const SHAPES: ShapeDef[] = [
  { id: "rectangle", label: "矩形", native: "rectangle", d: "M0 0H100V100H0Z" },
  { id: "rounded", label: "圆角矩形", native: "rectangle", rounded: true, d: "M16 0H84A16 16 0 0 1 100 16V84A16 16 0 0 1 84 100H16A16 16 0 0 1 0 84V16A16 16 0 0 1 16 0Z" },
  { id: "ellipse", label: "椭圆", native: "ellipse", d: "M50 0A50 50 0 0 1 50 100A50 50 0 0 1 50 0Z" },
  { id: "diamond", label: "菱形", native: "diamond", d: "M50 0L100 50L50 100L0 50Z" },
  { id: "triangle", label: "三角形", d: "M50 0L100 100H0Z" },
  { id: "parallelogram", label: "平行四边形", d: "M25 0H100L75 100H0Z" },
  { id: "trapezoid", label: "梯形", d: "M20 0H80L100 100H0Z" },
  { id: "pill", label: "胶囊 / 终止", d: "M25 0H75A25 50 0 0 1 75 100H25A25 50 0 0 1 25 0Z", size: [160, 64] },
  { id: "cylinder", label: "圆柱 / 数据库", d: "M0 12A50 12 0 0 1 100 12V88A50 12 0 0 1 0 88ZA50 12 0 0 0 100 12A50 12 0 0 1 0 12", size: [120, 140] },
  { id: "drum", label: "横向圆柱", d: "M12 0H88A12 50 0 0 1 88 100H12A12 50 0 0 1 12 0ZH88A12 50 0 0 0 88 100A12 50 0 0 1 88 0H12" },
  { id: "document", label: "文档", d: "M0 0H100V85C83 74 67 74 50 85C33 96 17 96 0 85Z" },
  { id: "multi-document", label: "多文档", d: "M0 12H88V88C73 79 59 79 44 88C29 97 15 97 0 88ZL6 12V6H94V82H88H94V6H12V0H100V76H94H100V0H12V6H6V12H0" },
  { id: "note", label: "便签", d: "M76 0L100 24V100H0V0ZV24H100H76V0" },
  { id: "card", label: "卡片", d: "M20 0H100V100H0V20Z" },
  { id: "speech", label: "对话框", d: "M0 0H100V74H45L25 96L30 74H0Z" },
  { id: "speech-round", label: "圆形对话框", d: "M50 0C78 0 100 16 100 38C100 60 78 76 50 76C44 76 38 75 33 74L12 96L18 68C7 61 0 50 0 38C0 16 22 0 50 0Z" },
  { id: "hexagon", label: "六边形", d: "M25 0H75L100 50L75 100H25L0 50Z" },
  { id: "octagon", label: "八边形", d: "M30 0H70L100 30V70L70 100H30L0 70V30Z" },
  { id: "pentagon", label: "五边形", d: "M50 0L100 38L81 100H19L0 38Z" },
  { id: "star", label: "星形", d: starPath(), size: [120, 120] },
  { id: "x-circle", label: "叉号圆", d: "M85.36 85.36A50 50 0 0 1 14.64 14.64A50 50 0 0 1 85.36 85.36L14.64 14.64A50 50 0 0 0 14.64 85.36L85.36 14.64A50 50 0 0 1 85.36 85.36", size: [100, 100] },
  { id: "heart", label: "心形", d: "M50 100C20 78 0 58 0 32C0 13 14 0 29 0C39 0 46 6 50 15C54 6 61 0 71 0C86 0 100 13 100 32C100 58 80 78 50 100Z", size: [120, 110] },
  { id: "cloud", label: "云", d: "M25 92C11 92 0 81 0 67C0 54 9 44 21 42C21 24 35 10 53 10C67 10 79 19 83 32C93 35 100 45 100 57C100 70 92 80 81 84C79 89 74 92 68 92Z" },
  { id: "arrow-up", label: "上箭头", d: "M30 100V40H5L50 0L95 40H70V100Z", size: [100, 120] },
  { id: "arrow-down", label: "下箭头", d: "M30 0V60H5L50 100L95 60H70V0Z", size: [100, 120] },
  { id: "arrow-left", label: "左箭头", d: "M100 30H40V5L0 50L40 95V70H100Z", size: [140, 90] },
  { id: "arrow-right", label: "右箭头", d: "M0 30H60V5L100 50L60 95V70H0Z", size: [140, 90] },
  { id: "arrow-both", label: "双向箭头", d: "M0 50L25 15V35H75V15L100 50L75 85V65H25V85Z", size: [160, 80] },
  { id: "cross", label: "十字", d: "M35 0H65V35H100V65H65V100H35V65H0V35H35Z", size: [100, 100] },
  { id: "lightning", label: "闪电", d: "M62 0L14 58H46L36 100L86 38H54Z", size: [90, 120] },
  { id: "predefined", label: "预定义过程", d: "M0 0H100V100H0ZH12V100H88V0H0" },
  { id: "manual-input", label: "手动输入", d: "M0 25L100 0V100H0Z" },
  { id: "off-page", label: "离页连接", d: "M0 0H75L100 50L75 100H0Z" },
  { id: "chevron", label: "燕尾", d: "M0 0H75L100 50L75 100H0L25 50Z" },
  { id: "cube", label: "立方体", d: "M0 25L25 0H100V75L75 100H0ZH75V100V25L100 0L75 25H0", size: [120, 120] },
  { id: "actor", label: "人形", d: "M50 30A14 14 0 0 1 50 2A14 14 0 0 1 50 30V66L20 100L50 66L80 100L50 66V42H10H90H50V30", size: [60, 110] },
  { id: "delay", label: "延迟", d: "M0 0H55A45 50 0 0 1 55 100H0Z" },
  { id: "folder", label: "文件夹", d: "M0 0H40L48 12H100V100H0Z" },
  { id: "internal-storage", label: "内部存储", d: "M0 0H100V100H0ZH15V100V0H0V15H100H0V0" },
  { id: "stack", label: "层叠", d: "M0 20H80V100H0ZH10V10H90V90H80H90V10H20V0H100V80H90H100V0H20V10H10V20H0" },
  { id: "brace-left", label: "左花括号", open: true, d: "M70 0C50 0 50 6 50 20V38C50 46 44 50 30 50C44 50 50 54 50 62V80C50 94 50 100 70 100", size: [40, 120] },
  { id: "brace-right", label: "右花括号", open: true, d: "M30 0C50 0 50 6 50 20V38C50 46 56 50 70 50C56 50 50 54 50 62V80C50 94 50 100 30 100", size: [40, 120] },
];
const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
export const shapeDef = (id: string) => BY_ID.get(id);

type Pt = [number, number];
const CURVE_STEPS = 12;
const ARC_STEP = Math.PI / 12;

/** Points of an SVG elliptical arc (endpoint parameterization → center parameterization). */
function arcPoints([x1, y1]: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, [x2, y2]: Pt): Pt[] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(delta) / ARC_STEP));
  return Array.from({ length: n }, (_, i) => {
    const t = start + (delta * (i + 1)) / n;
    const px = rx * Math.cos(t);
    const py = ry * Math.sin(t);
    return [cos * px - sin * py + cx, sin * px + cos * py + cy] as Pt;
  });
}

/** Flattens a path (M L H V C Q A Z, absolute) in the 0–100 box into unit points. */
function flattenPath(d: string): Pt[] {
  const tok = d.match(/[MLHVCQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: Pt[] = [];
  let i = 0;
  let cmd = "";
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  const num = () => Number(tok[i++]);
  const push = (p: Pt) => {
    out.push(p);
    cur = p;
  };
  while (i < tok.length) {
    if (/^[a-z]$/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    switch (cmd) {
      case "M":
        start = [num(), num()];
        push(start);
        cmd = "L";
        break;
      case "L":
        push([num(), num()]);
        break;
      case "H":
        push([num(), cur[1]]);
        break;
      case "V":
        push([cur[0], num()]);
        break;
      case "C": {
        const [x0, y0] = cur;
        const [a, b, c, e, x, y] = [num(), num(), num(), num(), num(), num()];
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          push([u * u * u * x0 + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x, u * u * u * y0 + 3 * u * u * t * b + 3 * u * t * t * e + t * t * t * y]);
        }
        break;
      }
      case "Q": {
        const [x0, y0] = cur;
        const [a, b, x, y] = [num(), num(), num(), num()];
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          push([u * u * x0 + 2 * u * t * a + t * t * x, u * u * y0 + 2 * u * t * b + t * t * y]);
        }
        break;
      }
      case "A": {
        const [rx, ry, rot, large, sweep, x, y] = [num(), num(), num(), num(), num(), num(), num()];
        for (const p of arcPoints(cur, rx, ry, rot, large === 1, sweep === 1, [x, y])) push(p);
        break;
      }
      case "Z":
        push(start);
        cmd = "";
        break;
      default:
        i++;
    }
  }
  return out.map(([x, y]) => [x / 100, y / 100]);
}

const unitCache = new Map<string, Pt[]>();
function unitPoints(def: ShapeDef) {
  let pts = unitCache.get(def.id);
  if (!pts) {
    pts = flattenPath(def.d);
    const [fx, fy] = pts[0];
    const [lx, ly] = pts[pts.length - 1];
    if (!def.open && (Math.abs(fx - lx) > 1e-6 || Math.abs(fy - ly) > 1e-6)) pts.push([fx, fy]);
    unitCache.set(def.id, pts);
  }
  return pts;
}

/** Library shape id of an element, or null when it isn't one of the library shapes. */
export function shapeOf(el: ExcalidrawElement): string | null {
  if ((el.customData as { kind?: string } | undefined)?.kind) return null;
  const s = (el.customData as { shape?: string } | undefined)?.shape;
  if (el.type === "line" && s && BY_ID.has(s)) return s;
  if (el.type === "rectangle") return el.roundness ? "rounded" : "rectangle";
  if (el.type === "ellipse" || el.type === "diamond") return el.type;
  return null;
}
export const isNativeShape = (id: string) => !!BY_ID.get(id)?.native;
export const hasBoundText = (el: ExcalidrawElement) => !!el.boundElements?.some((b) => b.type === "text");

/** Rebuilds `el` as another library shape, keeping id, geometry and style. */
export function convertShape(el: ExcalidrawElement, to: string): ExcalidrawElement {
  const def = BY_ID.get(to)!;
  const base = {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    angle: el.angle,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    fillStyle: el.fillStyle,
    strokeWidth: el.strokeWidth,
    strokeStyle: el.strokeStyle,
    roughness: el.roughness,
    opacity: el.opacity,
    groupIds: el.groupIds,
    frameId: el.frameId,
    locked: el.locked,
    link: el.link,
  };
  const customData = { ...el.customData, shape: def.native ? undefined : to };
  if (def.native) {
    const [n] = convertToExcalidrawElements([{ ...base, type: def.native, customData, roundness: def.rounded ? { type: 3 } : null } as never]);
    return { ...n, id: el.id, index: el.index, boundElements: el.boundElements, version: el.version + 1 } as ExcalidrawElement;
  }
  const points = unitPoints(def).map(([x, y]) => [x * el.width, y * el.height]);
  const [n] = convertToExcalidrawElements([{ ...base, type: "line", customData, roundness: null, points } as never]);
  return { ...n, id: el.id, index: el.index, boundElements: el.boundElements?.filter((b) => b.type !== "text") ?? null, version: el.version + 1 } as ExcalidrawElement;
}

/** Adds a library shape at the viewport center using the current item style. */
export function insertShape(api: API, id: string) {
  const { x, y } = viewportCenter(api);
  const s = api.getAppState();
  const [w, h] = BY_ID.get(id)?.size ?? [160, 100];
  const [rect] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: x - w / 2,
      y: y - h / 2,
      width: w,
      height: h,
      strokeColor: s.currentItemStrokeColor,
      backgroundColor: s.currentItemBackgroundColor,
      fillStyle: s.currentItemFillStyle,
      strokeWidth: s.currentItemStrokeWidth,
      strokeStyle: s.currentItemStrokeStyle,
      roughness: s.currentItemRoughness,
    } as never,
  ]);
  const el = id === "rectangle" ? rect : convertShape(rect, id);
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), el], appState: { selectedElementIds: { [el.id]: true } } as never, captureUpdate: "IMMEDIATELY" });
  api.setActiveTool({ type: "selection" });
}

/** Icon drawn from the shape's path (100×100 box). */
export function ShapeIcon({ id, className }: { id: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="-8 -8 116 116" className={className ?? "size-4"} fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
      <path d={BY_ID.get(id)?.d} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---------------- device frames ----------------

export const DEVICES = [
  { key: "phone", label: "手机" },
  { key: "tablet", label: "平板" },
  { key: "desktop", label: "桌面" },
  { key: "browser", label: "浏览器" },
] as const;
export type DeviceKind = (typeof DEVICES)[number]["key"];

const DEVICE_STROKE = "#242424";
const deviceStyle = { strokeColor: DEVICE_STROKE, backgroundColor: "transparent", roughness: 0, strokeWidth: 1, strokeStyle: "solid" };
const rect = (x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({ type: "rectangle", x, y, width, height, ...deviceStyle, ...extra });
const hline = (x: number, y: number, w: number, extra: Record<string, unknown> = {}) => ({ type: "line", x, y, points: [[0, 0], [w, 0]], ...deviceStyle, ...extra });
const dot = (x: number, y: number, size: number, [fill, stroke]: [string, string]) => ({ type: "ellipse", x, y, width: size, height: size, ...deviceStyle, strokeColor: stroke, backgroundColor: fill, fillStyle: "solid" });
const ICON_SIZE = 14;
const ICON_PATHS = { "arrow-left": "m12 19l-7-7l7-7m7 7H5", "arrow-right": "M5 12h14m-7-7l7 7l-7 7" } as const;
const iconFileId = (name: keyof typeof ICON_PATHS) => `yx-device-${name}`;
const icon = (x: number, y: number, name: keyof typeof ICON_PATHS) => ({ type: "image", x, y, width: ICON_SIZE, height: ICON_SIZE, fileId: iconFileId(name), status: "saved" });
function iconFile(name: keyof typeof ICON_PATHS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="${DEVICE_STROKE}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ICON_PATHS[name]}"/></svg>`;
  return { id: iconFileId(name), mimeType: "image/svg+xml", dataURL: `data:image/svg+xml;base64,${btoa(svg)}`, created: Date.now() };
}

function deviceParts(kind: DeviceKind) {
  const round = { roundness: { type: 3 } };
  switch (kind) {
    case "phone":
      return { width: 180, height: 380, items: [rect(0, 0, 180, 380, { strokeWidth: 2, ...round }), rect(76, 10, 28, 6, round), hline(62, 370, 56, { strokeWidth: 2 })] };
    case "tablet":
      return { width: 300, height: 400, items: [rect(0, 0, 300, 400, { strokeWidth: 2, ...round }), hline(110, 390, 80, { strokeWidth: 2 })] };
    case "desktop":
      return {
        width: 520,
        height: 360,
        items: [
          rect(0, 0, 520, 360, { strokeWidth: 2, roundness: { type: 3, value: 10 } }),
          dot(12, 12, 9, ["#ff5f57", "#e0443e"]),
          dot(27, 12, 9, ["#febc2e", "#dea123"]),
          dot(42, 12, 9, ["#28c840", "#1aab29"]),
        ],
      };
    case "browser":
      return { width: 560, height: 340, items: [rect(0, 0, 560, 340, { strokeWidth: 2 }), icon(10, 9, "arrow-left"), icon(26, 9, "arrow-right"), rect(52, 9, 496, 14, round), hline(0, 32, 560)] };
  }
}

/** Inserts a grouped device outline at the viewport center. */
export function insertDevice(api: API, kind: DeviceKind) {
  const { width, height, items } = deviceParts(kind);
  if (kind === "browser") api.addFiles([iconFile("arrow-left"), iconFile("arrow-right")] as never);
  const c = viewportCenter(api);
  const ox = c.x - width / 2;
  const oy = c.y - height / 2;
  const group = crypto.randomUUID();
  const els = convertToExcalidrawElements(items.map((e) => ({ ...e, x: e.x + ox, y: e.y + oy, groupIds: [group] })) as never).map((e) => ({ ...e, customData: { ...e.customData, device: kind } }));
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...els],
    appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [group]: true } } as never,
    captureUpdate: "IMMEDIATELY",
  });
  api.setActiveTool({ type: "selection" });
}
