import { convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { rollbackScene } from "./ops";
import { viewportCenter, type API } from "./scene";
import { uuid } from "@/lib/utils";

/**
 * Mermaid "diagram" nodes: the generated elements share a group whose id is the diagram id,
 * and each carries customData.diagram = { id, code } so the code can be edited and re-rendered in place.
 */
export type DiagramData = { id: string; code: string };

export const diagramOf = (el: { customData?: Record<string, unknown> }): DiagramData | null => {
  const d = el.customData?.diagram as DiagramData | undefined;
  return d?.id ? d : null;
};

export const DIAGRAM_PRESETS: { id: string; label: string; icon: string; code: string }[] = [
  {
    id: "flowchart",
    label: "流程图",
    icon: "workflow",
    code: `flowchart LR
  A([收到问题]) --> B{问题类型?}
  B -->|缺陷| C[复现问题]
  B -->|需求| D[需求评审]
  C --> E{能否复现?}
  E -->|是| F[修复并提测]
  E -->|否| G[补充信息]
  D --> F`,
  },
  {
    id: "sequence",
    label: "时序图",
    icon: "arrow-right-left",
    code: `sequenceDiagram
  participant 用户
  participant 前端
  participant 服务端
  用户->>前端: 点击登录
  前端->>服务端: POST /login
  服务端-->>前端: 返回 token
  前端-->>用户: 跳转首页`,
  },
  {
    id: "class",
    label: "类图",
    icon: "boxes",
    code: `classDiagram
  class Animal {
    +String name
    +move()
  }
  class Dog {
    +bark()
  }
  class Cat {
    +meow()
  }
  Animal <|-- Dog
  Animal <|-- Cat`,
  },
  {
    id: "state",
    label: "状态图",
    icon: "circle-dot-dashed",
    code: `stateDiagram-v2
  [*] --> 待处理
  待处理 --> 处理中: 领取
  处理中 --> 已完成: 完成
  处理中 --> 待处理: 退回
  已完成 --> [*]`,
  },
  {
    id: "er",
    label: "ER 图",
    icon: "database",
    code: `erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "ordered in"`,
  },
  {
    id: "gantt",
    label: "甘特图",
    icon: "gantt-chart",
    code: `gantt
  title 项目计划
  dateFormat YYYY-MM-DD
  section 设计
  需求分析 :a1, 2026-10-01, 5d
  交互设计 :after a1, 5d
  section 开发
  前端开发 :2026-10-10, 10d
  后端开发 :2026-10-10, 12d`,
  },
  {
    id: "pie",
    label: "饼图",
    icon: "chart-pie",
    code: `pie title 流量来源
  "搜索" : 42
  "直接访问" : 28
  "社交媒体" : 18
  "其他" : 12`,
  },
  {
    id: "mindmap",
    label: "思维导图",
    icon: "network",
    code: `mindmap
  root((白板编辑器))
    画布
      形状
      连线
    协作
      评论
      分享
    导出
      PNG
      SVG`,
  },
  {
    id: "timeline",
    label: "时间线",
    icon: "calendar-range",
    code: `timeline
  title 版本里程碑
  2026 Q3 : 脚手架 : 基础编辑
  2026 Q4 : 评论协作 : 图表代码
  2027 Q1 : 插件体系`,
  },
  {
    id: "journey",
    label: "用户旅程",
    icon: "route",
    code: `journey
  title 首次使用
  section 注册
    打开官网: 5: 用户
    填写信息: 3: 用户
  section 上手
    新建画布: 4: 用户
    邀请同事: 2: 用户`,
  },
  {
    id: "git",
    label: "Git 图",
    icon: "git-branch",
    code: `gitGraph
  commit
  branch feature
  checkout feature
  commit
  commit
  checkout main
  merge feature
  commit`,
  },
  {
    id: "quadrant",
    label: "象限图",
    icon: "layout-grid",
    code: `quadrantChart
  title 需求优先级
  x-axis 低投入 --> 高投入
  y-axis 低价值 --> 高价值
  quadrant-1 重点规划
  quadrant-2 立即去做
  quadrant-3 暂缓
  quadrant-4 谨慎评估
  评论功能: [0.3, 0.8]
  图表代码: [0.7, 0.75]
  主题切换: [0.2, 0.3]`,
  },
];

const LABELS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/, "流程图"],
  [/^sequenceDiagram\b/, "时序图"],
  [/^classDiagram\b/, "类图"],
  [/^stateDiagram(-v2)?\b/, "状态图"],
  [/^erDiagram\b/, "ER 图"],
  [/^gantt\b/, "甘特图"],
  [/^pie\b/, "饼图"],
  [/^mindmap\b/, "思维导图"],
  [/^journey\b/, "用户旅程"],
  [/^gitGraph\b/, "Git 图"],
  [/^timeline\b/, "时间线"],
  [/^quadrantChart\b/, "象限图"],
  [/^xychart(-beta)?\b/, "XY 图表"],
  [/^sankey(-beta)?\b/, "桑基图"],
  [/^block(-beta)?\b/, "块图"],
  [/^packet(-beta)?\b/, "数据包图"],
  [/^kanban\b/, "看板"],
  [/^architecture(-beta)?\b/, "架构图"],
  [/^requirementDiagram\b/, "需求图"],
  [/^C4\w+\b/, "C4 图"],
];

const headerLine = (code: string) =>
  code
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("%%") && l !== "---") ?? "";

export const diagramLabel = (code: string) => LABELS.find(([re]) => re.test(headerLine(code)))?.[1] ?? "图表";

/** Flowchart direction (LR covers RL, TD covers TB/BT), or null for non-flowcharts. */
export function flowDirection(code: string): "LR" | "TD" | null {
  const h = headerLine(code);
  const m = /^(flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/.exec(h);
  if (m) return m[2] === "LR" || m[2] === "RL" ? "LR" : "TD";
  return /^(flowchart|graph)\b/.test(h) ? "TD" : null;
}

export const withDirection = (code: string, dir: "LR" | "TD") => code.replace(/^(\s*)(flowchart|graph)(\s+(TB|TD|BT|LR|RL))?/m, `$1$2 ${dir}`);

type Pt = [number, number];
type Box = { x: number; y: number; width: number; height: number };

/** Orthogonal route between two boxes along the dominant axis, with fixed binding points. */
function elbowRoute(a: Box, b: Box) {
  const ca: Pt = [a.x + a.width / 2, a.y + a.height / 2];
  const cb: Pt = [b.x + b.width / 2, b.y + b.height / 2];
  const dx = cb[0] - ca[0];
  const dy = cb[1] - ca[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0;
    const s: Pt = [right ? a.x + a.width : a.x, ca[1]];
    const e: Pt = [right ? b.x : b.x + b.width, cb[1]];
    const mid = (s[0] + e[0]) / 2;
    return { points: Math.abs(s[1] - e[1]) < 1 ? [s, e] : [s, [mid, s[1]] as Pt, [mid, e[1]] as Pt, e], startFixed: [right ? 1 : 0, 0.5], endFixed: [right ? 0 : 1, 0.5] };
  }
  const down = dy >= 0;
  const s: Pt = [ca[0], down ? a.y + a.height : a.y];
  const e: Pt = [cb[0], down ? b.y : b.y + b.height];
  const mid = (s[1] + e[1]) / 2;
  return { points: Math.abs(s[0] - e[0]) < 1 ? [s, e] : [s, [s[0], mid] as Pt, [e[0], mid] as Pt, e], startFixed: [0.5, down ? 1 : 0], endFixed: [0.5, down ? 0 : 1] };
}

/** Point halfway along a polyline. */
function midpoint(pts: Pt[]): Pt {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let half = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) {
      const t = seg[i] ? half / seg[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    half -= seg[i];
  }
  return pts[pts.length - 1];
}

/** Turns bound flowchart arrows into elbow arrows and recenters their labels. */
function elbowArrows(els: ExcalidrawElement[]): ExcalidrawElement[] {
  const byId = new Map(els.map((e) => [e.id, e]));
  const labelAt = new Map<string, Pt>();
  return els
    .map((e) => {
      if (e.type !== "arrow" || !e.startBinding || !e.endBinding) return e;
      const a = byId.get(e.startBinding.elementId);
      const b = byId.get(e.endBinding.elementId);
      if (!a || !b) return e;
      const { points, startFixed, endFixed } = elbowRoute(a, b);
      const [ox, oy] = points[0];
      const rel = points.map(([x, y]) => [x - ox, y - oy] as Pt);
      const xs = rel.map((p) => p[0]);
      const ys = rel.map((p) => p[1]);
      const label = e.boundElements?.find((x) => x.type === "text");
      if (label) labelAt.set(label.id, midpoint(points));
      return {
        ...e,
        x: ox,
        y: oy,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        points: rel,
        elbowed: true,
        roundness: null,
        fixedSegments: null,
        startIsSpecial: false,
        endIsSpecial: false,
        startArrowhead: null,
        endArrowhead: "arrow",
        startBinding: { elementId: a.id, focus: 0, gap: 1, fixedPoint: startFixed },
        endBinding: { elementId: b.id, focus: 0, gap: 1, fixedPoint: endFixed },
      } as unknown as ExcalidrawElement;
    })
    .map((e) => {
      const p = labelAt.get(e.id);
      return p && e.type === "text" ? ({ ...e, x: p[0] - e.width / 2, y: p[1] - e.height / 2 } as ExcalidrawElement) : e;
    });
}

let lib: Promise<typeof import("@excalidraw/mermaid-to-excalidraw")> | null = null;
const loadLib = () => (lib ??= import("@excalidraw/mermaid-to-excalidraw"));

/** Mermaid code → clean (non-sketchy) Excalidraw elements. Throws on syntax errors. */
export async function renderDiagram(code: string) {
  const { parseMermaidToExcalidraw } = await loadLib();
  const res = await parseMermaidToExcalidraw(code, { themeVariables: { fontSize: "16px" }, flowchart: { curve: "linear" } } as never);
  let els = convertToExcalidrawElements(res.elements, { regenerateIds: true }).map(
    (e) => ({ ...e, roughness: 0, ...(e.type === "text" ? { fontFamily: 2 } : { strokeWidth: 1.5 }) }) as ExcalidrawElement,
  );
  if (flowDirection(code)) els = elbowArrows(els);
  return { elements: els, files: res.files ?? {} };
}

function bounds(els: readonly { x: number; y: number; width: number; height: number }[]) {
  const xs = els.flatMap((e) => [e.x, e.x + e.width]);
  const ys = els.flatMap((e) => [e.y, e.y + e.height]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function place(rendered: { elements: ExcalidrawElement[] }, data: DiagramData, at: { x: number; y: number }, outerGroups: string[] = []) {
  const b = bounds(rendered.elements);
  const dx = at.x - b.minX;
  const dy = at.y - b.minY;
  return rendered.elements.map(
    (e) => ({ ...e, x: e.x + dx, y: e.y + dy, groupIds: [...e.groupIds, data.id, ...outerGroups], customData: { ...e.customData, diagram: data } }) as ExcalidrawElement,
  );
}

/** Inserts a diagram at the viewport center, selects it and returns its id. */
export async function insertDiagram(api: API, code: string) {
  const rendered = await renderDiagram(code);
  const data = { id: uuid(), code };
  const b = bounds(rendered.elements);
  const c = viewportCenter(api);
  const els = place(rendered, data, { x: c.x - b.width / 2, y: c.y - b.height / 2 });
  api.addFiles(Object.values(rendered.files) as BinaryFileData[]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...els],
    appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [data.id]: true } } as never,
    captureUpdate: "IMMEDIATELY",
  });
  api.setActiveTool({ type: "selection" });
  return data.id;
}

// Scene snapshots taken before live previews, so the final commit is a single undo step.
const previewBase = new Map<string, ExcalidrawElement[]>();

/**
 * Re-renders diagram `id` from `code` at its current top-left.
 * "preview" updates without recording history; "immediate" restores the pre-preview scene first and records one step.
 */
export async function updateDiagram(api: API, id: string, code: string, mode: "preview" | "immediate" = "immediate") {
  const rendered = await renderDiagram(code);
  let scene = api.getSceneElementsIncludingDeleted() as ExcalidrawElement[];
  const { selectedElementIds } = api.getAppState();
  const wasSelected = scene.some((e) => !e.isDeleted && diagramOf(e)?.id === id && selectedElementIds[e.id]);
  if (mode === "preview" && !previewBase.has(id)) previewBase.set(id, scene.map((e) => ({ ...e })));
  const base = mode === "immediate" ? previewBase.get(id) : undefined;
  if (base) {
    previewBase.delete(id);
    scene = rollbackScene(api, base) as ExcalidrawElement[];
  }
  const old = scene.filter((e) => !e.isDeleted && diagramOf(e)?.id === id);
  if (!old.length) return;
  const b = bounds(old);
  const outer = old[0].groupIds.slice(old[0].groupIds.indexOf(id) + 1);
  const els = place(rendered, { id, code }, { x: b.minX, y: b.minY }, outer);
  const oldIds = new Set(old.map((e) => e.id));
  api.addFiles(Object.values(rendered.files) as BinaryFileData[]);
  api.updateScene({
    elements: [...scene.map((e) => (oldIds.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)), ...els],
    appState: wasSelected ? ({ selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [id]: true } } as never) : undefined,
    captureUpdate: mode === "preview" ? "NEVER" : "IMMEDIATELY",
  });
}

/** Drops an unfinished preview, restoring the scene from before it. */
export function cancelDiagramPreview(api: API, id: string) {
  const base = previewBase.get(id);
  if (!base) return;
  previewBase.delete(id);
  rollbackScene(api, base);
}

export function diagramCode(api: API, id: string) {
  const el = api.getSceneElements().find((e) => diagramOf(e)?.id === id);
  return el ? diagramOf(el)!.code : null;
}

// ---------------- syntax highlighting for the code panel ----------------

const HEADER = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|mindmap|journey|gitGraph|timeline|quadrantChart|xychart-beta|xychart|sankey-beta|block-beta|packet-beta|kanban|architecture-beta|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/;
const KEYWORDS = new Set(
  "direction TB TD BT LR RL subgraph end participant actor loop alt else opt par and critical break rect note Note over left right of class section title dateFormat axisFormat excludes todayMarker commit branch checkout merge cherry-pick root state as click style classDef linkStyle activate deactivate autonumber x-axis y-axis showData accTitle accDescr id tag type".split(
    " ",
  ),
);
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const span = (cls: string, s: string) => `<span class="mmd-${cls}">${esc(s)}</span>`;
const RULES: [RegExp, string | null][] = [
  [/^%%.*/, "comment"],
  [/^"[^"]*"?/, "string"],
  [/^\|[^|\n]+\|/, "label"],
  [/^(\(\(|\[\[|\[\(|\(\[|\{\{|\[\/|\[\\|>|\[|\(|\{)([^\])}\n]*)(\)\)|\]\]|\)\]|\]\)|\}\}|\/\]|\\\]|\]|\)|\})/, "shape"],
  [/^(?:(<\|?|[|}o][|o]?)?(-{2,}|={2,}|-\.+-|\.{2,})(>>|\|>|[|o][|{]|[>x)|o])?|-(?:>>|>|x|\)))/, "arrow"],
  [/^\d+(\.\d+)?%?/, "number"],
  [/^[A-Za-z_]\w*(?:-\w+)*/, "word"],
  [/^\s+/, null],
  [/^./, null],
];

function highlightLine(line: string) {
  let out = "";
  let rest = line;
  const h = HEADER.exec(line.trimStart());
  if (h) {
    const lead = line.length - line.trimStart().length;
    out += esc(line.slice(0, lead)) + span("type", h[0]);
    rest = line.slice(lead + h[0].length);
  }
  while (rest) {
    for (const [re, kind] of RULES) {
      const m = re.exec(rest);
      if (!m || !m[0]) continue;
      const t = m[0];
      if (kind === "shape") out += span("punct", m[1]) + span("string", m[2]) + span("punct", m[3]);
      else if (kind === "word") out += KEYWORDS.has(t) ? span("keyword", t) : esc(t);
      else out += kind ? span(kind, t) : esc(t);
      rest = rest.slice(t.length);
      break;
    }
  }
  return out;
}

export const highlightMermaid = (code: string) => code.split("\n").map(highlightLine).join("\n");
