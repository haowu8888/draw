import { ContextMenu as BContextMenu } from "@base-ui/react/context-menu";
import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  BoxSelect,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  Grid3x3,
  Group,
  ImageDown,
  ImagePlus,
  Layers,
  Lock,
  LockOpen,
  Maximize,
  MessageSquarePlus,
  Scissors,
  Trash2,
  Ungroup,
} from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearCanvas,
  copyAsPng,
  copySelection,
  cutSelection,
  deleteSelected,
  duplicateSelection,
  groupSelected,
  pasteAt,
  reorder,
  selectAll,
  selectedEls,
  setLocked,
  toggleGrid,
  ungroupSelected,
} from "./ops";
import type { API } from "./scene";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl+";
const SHIFT = IS_MAC ? "⇧" : "Shift+";
const ALT = IS_MAC ? "⌥" : "Alt+";

type Point = { x: number; y: number };
type Item =
  | { type?: "item"; id: string; label: string; icon?: React.ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: "submenu"; id: string; label: string; icon?: React.ReactNode; items: Item[] }
  | { type: "separator" };
const SEP: Item = { type: "separator" };

/** Topmost element whose box contains the scene point (bound text resolves to its container). */
export function elementAt(api: API, x: number, y: number): ExcalidrawElement | null {
  const els = api.getSceneElements();
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (x >= e.x && x <= e.x + e.width && y >= e.y && y <= e.y + e.height) {
      if (e.type === "text" && e.containerId) return els.find((c) => c.id === e.containerId) ?? e;
      return e;
    }
  }
  return null;
}

/** Makes `el` (or its outermost group) the selection unless it is already selected. */
function selectTarget(api: API, el: ExcalidrawElement) {
  if (api.getAppState().selectedElementIds[el.id]) return;
  const g = el.groupIds.at(-1);
  const ids = g ? api.getSceneElements().filter((e) => e.groupIds.includes(g)).map((e) => e.id) : [el.id];
  api.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])), selectedGroupIds: g ? { [g]: true } : {} } as never, captureUpdate: "NEVER" });
}

function insideSelection(api: API, p: Point) {
  const sel = selectedEls(api);
  if (!sel.length) return false;
  return p.x >= Math.min(...sel.map((e) => e.x)) && p.x <= Math.max(...sel.map((e) => e.x + e.width)) && p.y >= Math.min(...sel.map((e) => e.y)) && p.y <= Math.max(...sel.map((e) => e.y + e.height));
}

export interface CanvasMenuActions {
  addComment: (p: Point) => void;
  insertMedia: () => void;
  openExport: (scope: "canvas" | "selection") => void;
}

function buildItems(api: API, target: "canvas" | "element", point: Point, readOnly: boolean, act: CanvasMenuActions): Item[] {
  const exportAll: Item = { id: "export", label: "导出…", icon: <Download />, shortcut: `${MOD}${SHIFT}E`, onSelect: () => act.openExport("canvas") };
  const copyPng: Item = { id: "copy-png", label: "复制为 PNG", icon: <ClipboardCopy />, shortcut: `${SHIFT}${ALT}C`, onSelect: () => copyAsPng(api).then((copied) => (copied ? toast.success("已复制为 PNG") : toast.info("当前不是 HTTPS 访问，已改为下载 PNG")), () => toast.error("复制失败")) };
  const paste: Item = { id: "paste", label: "粘贴", icon: <ClipboardPaste />, shortcut: `${MOD}V`, onSelect: () => pasteAt(api, point).then((ok) => !ok && toast.info("剪贴板中没有可粘贴的元素")) };
  if (readOnly) return target === "element" ? [copyPng] : [exportAll];
  if (target === "canvas") {
    return [
      paste,
      { id: "select-all", label: "全选", icon: <BoxSelect />, shortcut: `${MOD}A`, onSelect: () => selectAll(api) },
      SEP,
      { id: "comment", label: "添加评论", icon: <MessageSquarePlus />, shortcut: "C", onSelect: () => act.addComment(point) },
      { id: "insert-media", label: "插入图片 / 视频", icon: <ImagePlus />, onSelect: act.insertMedia },
      SEP,
      { id: "grid", label: api.getAppState().gridModeEnabled ? "隐藏网格" : "显示网格", icon: <Grid3x3 />, shortcut: `${MOD}'`, onSelect: () => toggleGrid(api) },
      { id: "fit", label: "适应画布", icon: <Maximize />, shortcut: `${SHIFT}1`, onSelect: () => api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true }) },
      SEP,
      exportAll,
      SEP,
      { id: "clear", label: "清空画布", icon: <Trash2 />, danger: true, onSelect: () => clearCanvas(api) },
    ];
  }
  const sel = selectedEls(api);
  const locked = sel.length > 0 && sel.every((e) => e.locked);
  const grouped = sel.some((e) => e.groupIds.length > 0);
  const items: (Item | null)[] = [
    { id: "copy", label: "复制", icon: <Copy />, shortcut: `${MOD}C`, onSelect: () => copySelection(api) },
    { id: "cut", label: "剪切", icon: <Scissors />, shortcut: `${MOD}X`, onSelect: () => cutSelection(api) },
    paste,
    { id: "duplicate", label: "创建副本", icon: <CopyPlus />, shortcut: `${MOD}D`, onSelect: () => duplicateSelection(api) },
    SEP,
    { id: "comment", label: "添加评论", icon: <MessageSquarePlus />, shortcut: "C", onSelect: () => act.addComment(point) },
    copyPng,
    { id: "export-selection", label: "导出选中…", icon: <ImageDown />, onSelect: () => act.openExport("selection") },
    SEP,
    {
      type: "submenu",
      id: "order",
      label: "层级",
      icon: <Layers />,
      items: [
        { id: "front", label: "置于顶层", shortcut: `${MOD}${SHIFT}]`, onSelect: () => reorder(api, "front") },
        { id: "forward", label: "上移一层", shortcut: `${MOD}]`, onSelect: () => reorder(api, "forward") },
        { id: "backward", label: "下移一层", shortcut: `${MOD}[`, onSelect: () => reorder(api, "backward") },
        { id: "back", label: "置于底层", shortcut: `${MOD}${SHIFT}[`, onSelect: () => reorder(api, "back") },
      ],
    },
    sel.length > 1 ? { id: "group", label: "编组", icon: <Group />, shortcut: `${MOD}G`, onSelect: () => groupSelected(api) } : null,
    grouped ? { id: "ungroup", label: "取消编组", icon: <Ungroup />, shortcut: `${MOD}${SHIFT}G`, onSelect: () => ungroupSelected(api) } : null,
    { id: "lock", label: locked ? "解锁" : "锁定", icon: locked ? <LockOpen /> : <Lock />, shortcut: `${MOD}${SHIFT}L`, onSelect: () => setLocked(api, !locked) },
    SEP,
    { id: "delete", label: "删除", icon: <Trash2 />, shortcut: "Del", danger: true, onSelect: () => deleteSelected(api) },
  ];
  return items.filter((i): i is Item => i !== null);
}

/** Drops leading, trailing and doubled separators. */
function tidy(items: Item[]) {
  const out: Item[] = [];
  for (const i of items) if (i.type !== "separator" || (out.length && out[out.length - 1].type !== "separator")) out.push(i);
  while (out.length && out[out.length - 1].type === "separator") out.pop();
  return out;
}

const itemCls = "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-[13px] outline-none select-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const popupCls = "min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg/5 outline-none";

function Items({ items }: { items: Item[] }) {
  return tidy(items).map((it, i) => {
    if (it.type === "separator") return <BContextMenu.Separator key={`sep-${i}`} className="mx-2 my-1 h-px bg-border" />;
    if (it.type === "submenu")
      return (
        <BContextMenu.SubmenuRoot key={it.id}>
          <BContextMenu.SubmenuTrigger className={cn(itemCls, "data-[popup-open]:bg-accent")}>
            {it.icon}
            <span className="flex-1">{it.label}</span>
            <span className="text-muted-foreground">›</span>
          </BContextMenu.SubmenuTrigger>
          <BContextMenu.Portal>
            <BContextMenu.Positioner side="right" align="start" sideOffset={4} className="z-50">
              <BContextMenu.Popup className={popupCls}>
                <Items items={it.items} />
              </BContextMenu.Popup>
            </BContextMenu.Positioner>
          </BContextMenu.Portal>
        </BContextMenu.SubmenuRoot>
      );
    return (
      <BContextMenu.Item key={it.id} disabled={it.disabled} className={cn(itemCls, !it.icon && "ps-8", it.danger && "text-destructive-foreground [&_svg]:!text-destructive-foreground data-[highlighted]:bg-destructive/8")} onClick={it.onSelect}>
        {it.icon}
        <span className="flex-1">{it.label}</span>
        {it.shortcut && <span className="ms-auto ps-4 text-[11px] tracking-wide text-muted-foreground">{it.shortcut}</span>}
      </BContextMenu.Item>
    );
  });
}

export interface CanvasMenuHandle {
  /** Builds the menu for a right-click and opens it at the pointer; returns false when nothing to show. */
  open: (e: { clientX: number; clientY: number; target: EventTarget | null }) => boolean;
}

/** Replaces Excalidraw's context menu with the app's own (canvas vs. element items). */
export const CanvasContextMenu = forwardRef<CanvasMenuHandle, { api: API; readOnly: boolean; actions: CanvasMenuActions }>(function CanvasContextMenu({ api, readOnly, actions }, ref) {
  const trigger = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  useImperativeHandle(ref, () => ({
    open: ({ clientX, clientY }) => {
      const point = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
      const hit = elementAt(api, point.x, point.y);
      if (hit && !readOnly) selectTarget(api, hit);
      const target = hit || insideSelection(api, point) ? "element" : "canvas";
      const next = buildItems(api, target, point, readOnly, actions);
      if (!next.length) return false;
      setItems(next);
      setTimeout(() => trigger.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 })));
      return true;
    },
  }));
  return (
    <BContextMenu.Root>
      <BContextMenu.Trigger ref={trigger} className="pointer-events-none absolute size-0" />
      <BContextMenu.Portal>
        <BContextMenu.Positioner side="bottom" align="start" sideOffset={2} className="z-50">
          <BContextMenu.Popup className={popupCls}>
            <Items items={items} />
          </BContextMenu.Popup>
        </BContextMenu.Positioner>
      </BContextMenu.Portal>
    </BContextMenu.Root>
  );
});
