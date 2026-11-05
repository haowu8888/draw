import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  ArrowRightLeft,
  ArrowUpRight,
  Boxes,
  CalendarRange,
  ChartGantt,
  CircleDotDashed,
  CodeXml,
  Database,
  GitBranch,
  LayoutGrid,
  MoveUpRight,
  Network,
  PanelTop,
  Route,
  Smartphone,
  SquareDashed,
  Tablet,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code,
  Diamond,
  Eraser,
  FileCode2,
  Frame,
  Globe,
  Hand,
  Image,
  Loader2,
  MessageSquare,
  Minus,
  MonitorSmartphone,
  MousePointer2,
  NotebookText,
  Pencil,
  Plus,
  Shapes,
  Smile,
  Square,
  Type,
  Video,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Popover, Tooltip } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CHART_ICONS, CHART_TYPES, defaultChart, type ChartType } from "./chart";
import { useEditor } from "./editor-context";
import { createEmbeddable, createNode, insertElements, randomId } from "./scene";
import { DIAGRAM_PRESETS, insertDiagram } from "./diagram";
import { makeLinkCard } from "./node-bars";
import { insertCodeBlock } from "./codeblock";
import { DEVICES, insertDevice, insertShape, SHAPES, ShapeIcon } from "./shapes";



export function LeftToolbar() {
  const { api, ui, canEdit, commentMode, setCommentMode } = useEditor();
  const [insertOpen, setInsertOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]") || ui.editingText) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setInsertOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canEdit, ui.editingText]);

  const tool = (type: string) => {
    setCommentMode(false);
    api.setActiveTool({ type: type as never });
  };
  const active = (type: string) => !commentMode && ui.tool === type;

  const T = ({ type, label, k, icon }: { type: string; label: string; k?: string; icon: React.ReactNode }) => (
    <Tooltip content={k ? `${label} · ${k.toUpperCase()}` : label} side="right">
      <button className="tool-btn" aria-label={label} data-active={active(type)} onClick={() => tool(type)}>
        {icon}
        {k && <span className="kbd">{k}</span>}
      </button>
    </Tooltip>
  );

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
      {canEdit && (
        <div className="board-panel p-1">
          <Popover
            open={insertOpen}
            onOpenChange={setInsertOpen}
            side="right"
            align="start"
            sideOffset={10}
            className="w-auto p-3"
            trigger={
              <button className="tool-btn" aria-label="插入" data-active={insertOpen}>
                {insertOpen ? <X /> : <Plus />}
                <span className="kbd">/</span>
              </button>
            }
          >
            <InsertPanel onClose={() => setInsertOpen(false)} />
          </Popover>
        </div>
      )}
      <div className="board-panel flex flex-col gap-0.5 p-1">
        <T type="selection" label="选择" k="v" icon={<MousePointer2 />} />
        <T type="hand" label="平移" k="h" icon={<Hand />} />
      </div>
      {canEdit && (
        <>
          <div className="board-panel flex flex-col gap-0.5 p-1">
            <T type="rectangle" label="矩形" k="r" icon={<Square />} />
            <T type="ellipse" label="椭圆" k="o" icon={<Circle />} />
            <T type="diamond" label="菱形" k="d" icon={<Diamond />} />
            <T type="arrow" label="箭头" k="a" icon={<MoveUpRight />} />
            <T type="line" label="直线" k="l" icon={<Minus />} />
            <T type="freedraw" label="画笔" k="p" icon={<Pencil />} />
            <T type="text" label="文本" k="t" icon={<Type />} />
            <T type="eraser" label="橡皮擦" k="e" icon={<Eraser />} />
            <Popover
              open={iconOpen}
              onOpenChange={setIconOpen}
              side="right"
              align="end"
              sideOffset={10}
              className="w-64 p-3"
              trigger={
                <button className="tool-btn" aria-label="图标" data-active={iconOpen}>
                  <Smile />
                </button>
              }
            >
              <IconPicker onDone={() => setIconOpen(false)} />
            </Popover>
            <ChartPicker />
            <ImageVideoButton />
          </div>
          <div className="board-panel flex flex-col gap-0.5 p-1">
            <T type="frame" label="画框" k="f" icon={<SquareDashed />} />
            <Tooltip content="评论 · C" side="right">
              <button className="tool-btn" aria-label="评论" data-active={commentMode} onClick={() => setCommentMode(!commentMode)}>
                <MessageSquare />
                <span className="kbd">c</span>
              </button>
            </Tooltip>
          </div>
        </>
      )}
      {!canEdit && (
        <div className="board-panel flex flex-col gap-0.5 p-1">
          <Tooltip content="评论 · C" side="right">
            <button className="tool-btn" aria-label="评论" data-active={commentMode} onClick={() => setCommentMode(!commentMode)}>
              <MessageSquare />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// ---------------- insert panel ----------------

type View = "home" | "diagrams" | "sandbox" | "shapes" | "icons" | "devices" | "web";
const VIEW_TITLES: Record<Exclude<View, "home">, string> = { icons: "图标", shapes: "形状", devices: "设备外框", diagrams: "图表代码", web: "网页嵌入", sandbox: "代码展示" };
const STACK_KIND: Record<string, string> = { html: "HTML", react: "React", vue: "Vue" };
const DIAGRAM_ICONS: Record<string, React.ReactNode> = {
  workflow: <Workflow />,
  "arrow-right-left": <ArrowRightLeft />,
  boxes: <Boxes />,
  "circle-dot-dashed": <CircleDotDashed />,
  database: <Database />,
  "gantt-chart": <ChartGantt />,
  "chart-pie": <ChartPie />,
  network: <Network />,
  "calendar-range": <CalendarRange />,
  route: <Route />,
  "git-branch": <GitBranch />,
  "layout-grid": <LayoutGrid />,
};
const DEVICE_ICONS: Record<string, React.ReactNode> = { phone: <Smartphone />, tablet: <Tablet />, desktop: <AppWindow />, browser: <PanelTop /> };

export const MARKDOWN_SAMPLE = `## 标题

支持 **加粗**、*斜体*、==高亮==、\`代码\` 与 [链接](https://example.com)。

- [x] 任务列表
- [ ] 待办

| 列名 | 数值 |
| --- | --- |
| 收入 | 120 |

:::tip
提示框 · 公式 $E=mc^2$
:::
`;

type Entry = { id: string; title: string; description: string; icon: React.ReactNode; view?: View; run?: () => void };

/** Small square tile with a caption (shape / diagram / device grids). */
function Tile({ title, icon, onClick }: { title: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="group flex flex-col items-center gap-1" onClick={onClick}>
      <span className="flex h-12 w-full items-center justify-center rounded-md border bg-background text-muted-foreground group-hover:bg-accent group-hover:text-foreground [&_svg]:size-5">{icon}</span>
      <span className="text-[11px] text-muted-foreground">{title}</span>
    </button>
  );
}

function InsertPanel({ onClose }: { onClose: () => void }) {
  const { api, openDialog, setPanel } = useEditor();
  const trpc = useTRPC();
  const { data: env } = useQuery(trpc.codeStack.list.queryOptions());
  const stacks = (env?.stacks ?? []).filter((s) => s.enabled);
  const [view, setView] = useState<View>("home");
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);

  const addDiagram = (code: string) => {
    onClose();
    insertDiagram(api, code)
      .then((id) => setTimeout(() => setPanel({ kind: "diagram", id }), 150))
      .catch((e) => (console.error("diagram", e), toast.error("图表生成失败")));
  };
  const addMarkdown = () => {
    const [el] = insertElements(api, [createNode("markdown", 420, 360, { source: MARKDOWN_SAMPLE })]) ?? [];
    if (el) setTimeout(() => setPanel({ kind: "markdown", id: el.id }), 150);
  };
  const addSandbox = (s: (typeof stacks)[number]) => {
    onClose();
    const [el] = insertElements(api, [createNode("code", 640, 420, { stack: s.key, code: s.starter ?? "", scale: 1 })]) ?? [];
    if (el) setTimeout(() => setPanel({ kind: "sandbox", id: el.id }), 150);
  };
  const addWeb = async (mode: "card" | "embed") => {
    const raw = url.trim();
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!u.hostname.includes(".")) throw new Error();
    } catch {
      return setUrlError(true);
    }
    onClose();
    if (mode === "embed") return insertElements(api, [createEmbeddable(u.toString(), 720, 450)]);
    insertElements(api, [await makeLinkCard(u.toString())]);
  };

  const categories: Entry[] = [
    { id: "diagrams", title: "图表代码", description: "Mermaid：流程图、时序图、甘特图等", icon: <Workflow />, view: "diagrams" },
    { id: "markdown", title: "Markdown", description: "标题、列表、表格、代码、公式、提示框", icon: <NotebookText />, run: addMarkdown },
    ...(stacks.length ? [{ id: "sandbox", title: "代码展示", description: "HTML / React / Vue 组件实时运行", icon: <AppWindow />, view: "sandbox" as View }] : []),
    { id: "shapes", title: "形状", description: "矩形、菱形、多边形、星形等", icon: <Shapes />, view: "shapes" },
    { id: "icons", title: "图标", description: "搜索 Iconify 图标库", icon: <Smile />, view: "icons" },
    { id: "devices", title: "设备外框", description: "手机、平板、桌面、浏览器", icon: <MonitorSmartphone />, view: "devices" },
    { id: "web", title: "网页嵌入", description: "嵌入在线网站，可在画布内操作", icon: <Globe />, view: "web" },
  ];
  const quick: Entry[] = [
    { id: "frame", title: "画框", description: "", icon: <SquareDashed />, run: () => api.setActiveTool({ type: "frame" }) },
    { id: "code", title: "代码块", description: "", icon: <CodeXml />, run: () => {
        const id = insertCodeBlock(api);
        if (id) setTimeout(() => setPanel({ kind: "codeblock", id }), 150);
      } },
    { id: "image", title: "图片", description: "", icon: <Image />, run: () => api.setActiveTool({ type: "image", insertOnCanvasDirectly: true } as never) },
    { id: "video", title: "视频", description: "", icon: <Video />, run: () => openDialog({ kind: "video" }) },
  ];
  const all: Entry[] = [
    ...categories,
    ...quick.map((e) => ({ ...e, description: `插入${e.title}` })),
    ...DIAGRAM_PRESETS.map((d) => ({ id: `diagram-${d.id}`, title: d.label, description: "图表代码（Mermaid）", icon: DIAGRAM_ICONS[d.icon], run: () => addDiagram(d.code) })),
    ...stacks.map((s) => ({ id: `sandbox-${s.id}`, title: s.name, description: "代码展示", icon: <AppWindow />, run: () => addSandbox(s) })),
    ...DEVICES.map((d) => ({ id: `device-${d.key}`, title: `${d.label}外框`, description: "设备外框", icon: DEVICE_ICONS[d.key], run: () => insertDevice(api, d.key) })),
  ];
  const term = q.trim().toLowerCase();
  const list = term ? all.filter((e) => `${e.title}${e.description}${e.id}`.toLowerCase().includes(term)) : categories;
  const choose = (e: Entry) => {
    if (e.view) return setView(e.view);
    e.run?.();
    onClose();
  };

  if (view === "home") {
    return (
      <div className="flex w-64 flex-col gap-3">
        <Input autoFocus type="search" placeholder="插入内容" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
        <div className="text-xs font-medium">{term ? "搜索结果" : "全部分类"}</div>
        <div className="flex flex-col gap-1.5">
          {list.map((e) => (
            <button key={e.id} type="button" className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-left hover:bg-accent [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground" onClick={() => choose(e)}>
              {e.icon}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{e.title}</span>
                <span className="truncate text-xs text-muted-foreground">{e.description}</span>
              </span>
              {e.view && <ChevronRight className="!size-4 text-muted-foreground" />}
            </button>
          ))}
          {!list.length && <div className="py-6 text-center text-sm text-muted-foreground">无匹配项</div>}
        </div>
        {!term && (
          <div className="grid grid-cols-4 gap-1.5">
            {quick.map((e) => (
              <Tile key={e.id} title={e.title} icon={e.icon} onClick={() => choose(e)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-64 flex-col gap-3">
      <div className="flex items-center gap-1 text-xs">
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setView("home")}>
          全部分类
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{VIEW_TITLES[view]}</span>
      </div>
      {view === "icons" && <IconPicker onDone={onClose} />}
      {view === "shapes" && (
        <div className="grid grid-cols-4 gap-2">
          {SHAPES.map((s) => (
            <Tile key={s.id} title={s.label} icon={<ShapeIcon id={s.id} className="size-5" />} onClick={() => (insertShape(api, s.id), onClose())} />
          ))}
        </div>
      )}
      {view === "diagrams" && (
        <div className="grid grid-cols-4 gap-2">
          {DIAGRAM_PRESETS.map((d) => (
            <Tile key={d.id} title={d.label} icon={DIAGRAM_ICONS[d.icon]} onClick={() => addDiagram(d.code)} />
          ))}
        </div>
      )}
      {view === "sandbox" && (
        <div className="flex flex-col gap-1.5">
          {stacks.map((s) => (
            <button key={s.id} type="button" className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-left hover:bg-accent" onClick={() => addSandbox(s)}>
              <span className="flex h-6 w-12 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">{STACK_KIND[s.runtime] ?? s.runtime}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{s.name}</span>
                {s.description && <span className="truncate text-xs text-muted-foreground">{s.description}</span>}
              </span>
            </button>
          ))}
          <p className="text-[11px] leading-relaxed text-muted-foreground">在隔离的沙箱中运行，只能使用方案内置的框架，不能联网或引入其他脚本。</p>
        </div>
      )}
      {view === "devices" && (
        <div className="grid grid-cols-4 gap-2">
          {DEVICES.map((d) => (
            <Tile key={d.key} title={d.label} icon={DEVICE_ICONS[d.key]} onClick={() => (insertDevice(api, d.key), onClose())} />
          ))}
        </div>
      )}
      {view === "web" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addWeb("card");
          }}
        >
          <Input
            autoFocus
            className="h-8"
            placeholder="输入网址，如 example.com"
            value={url}
            aria-invalid={urlError || undefined}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(false);
            }}
          />
          {urlError && <span className="text-xs text-destructive-foreground">请输入有效的网址</span>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="flex-1" disabled={!url.trim()}>
              插入卡片
            </Button>
            <Button type="button" size="sm" variant="outline" className="flex-1" disabled={!url.trim()} onClick={() => addWeb("embed")}>
              嵌入网页
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">卡片显示标题、描述与预览图；嵌入网页可在画布内操作，部分网站禁止被嵌入（X-Frame-Options），会显示为空白。选中后可在两者之间切换。</p>
        </form>
      )}
    </div>
  );
}

// ---------------- icons ----------------

const DEFAULT_ICONS = ["activity", "airplay", "alarm-clock", "anchor", "archive", "bell", "book", "bookmark", "box", "briefcase", "calendar", "camera", "chart-bar", "check", "circle-alert", "clock", "cloud", "code", "cpu", "credit-card", "database", "file", "folder", "gift", "globe", "heart", "house", "image", "key", "lock", "mail", "map-pin", "message-circle", "monitor", "phone", "rocket", "search", "server", "settings", "shield", "shopping-cart", "star", "user", "users", "wifi"].map((n) => `lucide:${n}`);

export async function svgToDataUrl(icon: string, color = "#1e1e1e") {
  const [prefix, name] = icon.split(":");
  const res = await fetch(`https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}&width=96&height=96`);
  if (!res.ok) throw new Error("图片加载失败");
  const svg = await res.text();
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` as DataURL;
}

export async function insertIcon(api: ReturnType<typeof useEditor>["api"], icon: string) {
  const dataURL = await svgToDataUrl(icon);
  const fileId = `icon-${icon.replace(/[^a-z0-9]/gi, "-")}-${randomId()}`;
  api.addFiles([{ id: fileId, mimeType: "image/svg+xml", dataURL, created: Date.now() } as BinaryFileData]);
  const els = convertToExcalidrawElements([{ type: "image", fileId, x: 0, y: 0, width: 64, height: 64 } as never]);
  insertElements(api, els);
}

function IconPicker({ onDone }: { onDone: () => void }) {
  const { api } = useEditor();
  const [q, setQ] = useState("");
  const [icons, setIcons] = useState<string[]>(DEFAULT_ICONS);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) return setIcons(DEFAULT_ICONS);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q.trim())}&limit=60`).then((x) => x.json());
        setIcons(r.icons ?? []);
      } catch {
        setIcons([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [q]);
  const pick = async (icon: string) => {
    setBusy(icon);
    try {
      await insertIcon(api, icon);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Input autoFocus className="h-8" placeholder="搜索图标" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : icons.length ? (
        <div className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto">
          {icons.map((icon) => (
            <Tooltip key={icon} content={icon}>
              <button className="flex aspect-square items-center justify-center rounded-md hover:bg-accent" onClick={() => pick(icon)} aria-label={icon}>
                {busy === icon ? <Loader2 className="size-4 animate-spin" /> : <img src={`https://api.iconify.design/${icon.replace(":", "/")}.svg?height=20`} alt="" className="size-5" loading="lazy" />}
              </button>
            </Tooltip>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted-foreground">没有找到图标</div>
      )}
    </div>
  );
}

// ---------------- charts ----------------

function ChartPicker() {
  const { api } = useEditor();
  const [open, setOpen] = useState(false);
  const insert = (type: ChartType) => {
    const size = type === "pie" || type === "donut" ? [420, 300] : [520, 320];
    insertElements(api, [createNode("chart", size[0], size[1], { chart: defaultChart(type) })]);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="right"
      align="end"
      sideOffset={10}
      className="w-auto p-2"
      trigger={
        <button className="tool-btn" aria-label="图表" data-active={open}>
          <ChartPie />
        </button>
      }
    >
      <div className="grid w-[216px] grid-cols-3 gap-1">
        {CHART_TYPES.map((c) => (
          <button key={c.value} type="button" className="flex h-14 flex-col items-center justify-center gap-1 rounded-md text-xs hover:bg-accent" onClick={() => insert(c.value)}>
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={CHART_ICONS[c.value]} />
            </svg>
            {c.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function ImageVideoButton() {
  const { api, openDialog } = useEditor();
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => [
      { label: "图片", icon: <Image />, fn: () => api.setActiveTool({ type: "image", insertOnCanvasDirectly: true } as never) },
      { label: "视频", icon: <Video />, fn: () => openDialog({ kind: "video" }) },
    ],
    [api, openDialog],
  );
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="right"
      align="end"
      sideOffset={10}
      className="w-36 p-1"
      trigger={
        <button className="tool-btn" aria-label="图片 / 视频" data-active={open}>
          <Image />
        </button>
      }
    >
      {items.map((it) => (
        <button
          key={it.label}
          className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground")}
          onClick={() => {
            setOpen(false);
            it.fn();
          }}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </Popover>
  );
}
