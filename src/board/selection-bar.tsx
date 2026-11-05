import { Popover as BPopover } from "@base-ui/react/popover";
import { Tooltip as BTooltip } from "@base-ui/react/tooltip";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import { useQuery } from "@tanstack/react-query";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Ban,
  ChartColumn,
  ChevronDown,
  Code,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MessageSquare,
  NotebookPen,
  Pilcrow,
  Pipette,
  Plus,
  SquareDashed,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input, Menu, MenuItem, MenuSeparator, Popover, SubMenu, Switch } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CHART_TYPES, type ChartConfig, type ChartType } from "./chart";
import { ChartControls } from "./chart-panel";
import { createCodeBlock } from "./codeblock";
import { CodeBlockControls, LinkCardControls, SandboxControls, WebEmbedControls } from "./node-bars";
import { DiagramControls } from "./diagram-panel";
import { diagramOf } from "./diagram";
import { useEditor } from "./editor-context";
import { FrameControls } from "./frames";
import {
  commonValue,
  convertText,
  copyAsPng,
  copyAsSvg,
  copyStyle,
  deleteSelected,
  FONT_SIZES,
  FONTS,
  fillMode,
  baseColor,
  hasCopiedStyle,
  isPaletteColor,
  LINE_HEIGHTS,
  mapSelected,
  OPACITIES,
  PALETTE,
  pasteStyle,
  reorder,
  runAction,
  sameColor,
  setBaseColor,
  setFillMode,
  setLocked,
  setOutlineColor,
  setStrokeColor,
  setTextColorOverride,
  STROKE_STYLES,
  STROKE_WIDTHS,
  updateSelected,
  wrapInFrame,
} from "./ops";
import { buildSrcDoc } from "./sandbox";
import { createNode, nodeKind, updateElements } from "./scene";
import { convertShape, hasBoundText, isNativeShape, SHAPES, ShapeIcon, shapeOf } from "./shapes";

export const NODE_SIZES = [
  { label: "手机", w: 390, h: 844 },
  { label: "平板", w: 768, h: 1024 },
  { label: "桌面", w: 1280, h: 800 },
  { label: "卡片", w: 640, h: 420 },
  { label: "横幅", w: 1200, h: 400 },
];

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl+";
const SHIFT = IS_MAC ? "⇧" : "Shift+";
const ALT = IS_MAC ? "⌥" : "Alt+";
const MAX_FONT = 1000;
const MAX_STROKE = 20;
const NO_STROKE_TYPES = new Set(["image", "embeddable", "iframe", "frame", "magicframe"]);
const LAYERS = [
  { value: "front", label: "置于顶层", icon: <ArrowUpToLine />, shortcut: `${MOD}${SHIFT}]` },
  { value: "forward", label: "上移一层", icon: <ArrowUp />, shortcut: `${MOD}]` },
  { value: "backward", label: "下移一层", icon: <ArrowDown />, shortcut: `${MOD}[` },
  { value: "back", label: "置于底层", icon: <ArrowDownToLine />, shortcut: `${MOD}${SHIFT}[` },
] as const;
const H_ALIGNS = [
  { value: "left", label: "左对齐", icon: <TextAlignStart /> },
  { value: "center", label: "居中", icon: <TextAlignCenter /> },
  { value: "right", label: "右对齐", icon: <TextAlignEnd /> },
];
const V_ALIGNS = [
  { value: "top", label: "顶部对齐", icon: <AlignVerticalJustifyStart /> },
  { value: "middle", label: "垂直居中", icon: <AlignVerticalJustifyCenter /> },
  { value: "bottom", label: "底部对齐", icon: <AlignVerticalJustifyEnd /> },
];

// ---------------- primitives ----------------

function Caret() {
  return (
    <svg aria-hidden viewBox="0 0 8 8" className="caret size-2 shrink-0 opacity-50" fill="currentColor">
      <path d="M1 2.5h6L4 6z" />
    </svg>
  );
}

/** Toolbar button with a styled tooltip; forwards props so it can be a popover/menu trigger. */
function BarButton({ label, icon, caret, pressed, className, ...props }: React.ComponentProps<"button"> & { label: string; icon: React.ReactNode; caret?: boolean; pressed?: boolean }) {
  return (
    <BTooltip.Root disabled={!!(caret && pressed)}>
      <BTooltip.Trigger
        render={
          <button type="button" aria-label={label} aria-pressed={pressed} className={cn("bar-toggle", caret ? "with-caret" : "size-8", className)} {...props}>
            {icon}
            {caret && <Caret />}
          </button>
        }
      />
      <BTooltip.Portal>
        <BTooltip.Positioner side="top" sideOffset={8} className="z-[60]">
          <BTooltip.Popup className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-md">{label}</BTooltip.Popup>
        </BTooltip.Positioner>
      </BTooltip.Portal>
    </BTooltip.Root>
  );
}

/** Bar group: icon + caret trigger opening a popover above the bar. */
function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <BPopover.Root open={open} onOpenChange={setOpen}>
      <BPopover.Trigger render={<BarButton icon={icon} label={label} caret pressed={open} />} />
      <BPopover.Portal>
        <BPopover.Positioner side="top" sideOffset={8} className="z-50">
          <BPopover.Popup className="rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg/5 outline-none">
            <div className="flex flex-col">{children}</div>
          </BPopover.Popup>
        </BPopover.Positioner>
      </BPopover.Portal>
    </BPopover.Root>
  );
}

const optionCls = (active: boolean) => cn("flex h-8 items-center justify-center rounded-md text-xs transition-colors", active ? "bg-[var(--highlight)] text-[var(--highlight-foreground)]" : "bg-muted/60 hover:bg-accent");
const VSep = () => <div className="mx-1 h-5 w-px shrink-0 bg-border" />;
const HSep = () => <div className="-mx-2 my-2 h-px bg-border" />;
const Label = ({ children }: { children: React.ReactNode }) => <span className="text-xs text-muted-foreground">{children}</span>;

function LineSample({ width = 1.5, dash }: { width?: number; dash?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 64 8" preserveAspectRatio="none" className="h-2 w-full">
      <line x1={0} y1={4} x2={64} y2={4} stroke="currentColor" strokeWidth={width} strokeDasharray={dash} />
    </svg>
  );
}

function Swatch({ fill, border, active, label, onClick, className }: { fill: string; border?: string; active?: boolean; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("size-6 rounded-[5px] border outline-none transition-shadow", active && "ring-2 ring-[var(--highlight)] ring-offset-1 ring-offset-popover", className)}
      style={{ backgroundColor: fill, borderColor: border }}
    />
  );
}

const NO_FILL_BG = "bg-[linear-gradient(135deg,transparent_calc(50%-0.5px),#a3a3a3_calc(50%-0.5px),#a3a3a3_calc(50%+0.5px),transparent_calc(50%+0.5px))]";

/** Custom color editor: native picker, hex input and eyedropper. */
function CustomColor({ value, onChange }: { value?: string; onChange: (c: string, commit: boolean) => void }) {
  const [hex, setHex] = useState(value ?? "#000000");
  const eyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  return (
    <div className="flex w-full items-center gap-1.5">
      <input type="color" aria-label="选择颜色" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"} className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" onChange={(e) => (setHex(e.target.value), onChange(e.target.value, false))} onBlur={() => onChange(hex, true)} />
      <Input className="h-7 font-mono text-xs" value={hex} aria-label="十六进制颜色" onChange={(e) => setHex(e.target.value)} onKeyDown={(e) => e.key === "Enter" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) && onChange(hex, true)} />
      {eyeDropper && (
        <button
          type="button"
          className="bar-toggle size-7 shrink-0"
          aria-label="吸管取色"
          title="吸管取色"
          onClick={async () => {
            try {
              const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open();
              setHex(r.sRGBHex);
              onChange(r.sRGBHex, true);
            } catch {
              /* cancelled */
            }
          }}
        >
          <Pipette />
        </button>
      )}
    </div>
  );
}

/** Swatch grid with a trailing rainbow button that reveals the custom color editor. */
function ColorGrid({ children, leading, columns = 5, value, customActive, onCustom }: { children: React.ReactNode; leading?: React.ReactNode; columns?: 5 | 6; value?: string; customActive?: boolean; onCustom: (c: string, commit: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <div className={cn("grid gap-2 p-1", columns === 6 ? "grid-cols-6" : "grid-cols-5")}>
        {leading}
        {children}
        <button
          type="button"
          aria-label="自定义颜色"
          aria-expanded={open}
          title="自定义颜色"
          className={cn("size-6 rounded-[5px] bg-[conic-gradient(from_180deg,#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#a855f7,#ef4444)] outline-none", (open || customActive) && "ring-2 ring-[var(--highlight)] ring-offset-1 ring-offset-popover")}
          onClick={() => setOpen((o) => !o)}
        />
      </div>
      {open && (
        <>
          <HSep />
          <div className="p-1">
            <CustomColor value={value} onChange={onCustom} />
          </div>
        </>
      )}
    </div>
  );
}

function ColorDot({ value }: { value: string | null | undefined }) {
  if (value === "auto" || value == null) {
    return (
      <span className="size-3.5 shrink-0 rounded-full bg-[conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)] p-[3px]">
        <span className="block size-full rounded-full bg-popover" />
      </span>
    );
  }
  if (value === "transparent") return <span className={cn("size-3.5 shrink-0 rounded-full border border-neutral-300", NO_FILL_BG)} />;
  return <span className="size-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: value }} />;
}

/** Row with a label and a compact color dropdown (auto / none / palette / custom). */
function OverrideColor({ label, value, allowNone, extra = [], onChange }: { label: string; value: string | null; allowNone?: boolean; extra?: string[]; onChange: (c: string, commit: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const colors = [...PALETTE.map((p) => p.stroke), ...extra];
  const custom = !!value && value !== "auto" && value !== "transparent" && !colors.includes(value);
  const text = value === null ? "混合" : value === "auto" ? "自动" : value === "transparent" ? "无" : value.toUpperCase();
  const pick = (c: string) => {
    onChange(c, true);
    setOpen(false);
  };
  const chip = (active: boolean) => cn("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs", active ? "border-[var(--highlight)] bg-[var(--highlight)]/10 font-medium" : "hover:bg-accent");
  return (
    <div className="flex items-center justify-between gap-3">
      <Label>{label}</Label>
      <Popover
        open={open}
        onOpenChange={setOpen}
        side="top"
        align="end"
        className="w-[228px] p-2"
        trigger={
          <button type="button" aria-label={`${label}颜色`} className="flex h-7 w-28 items-center gap-2 rounded-md border px-2 text-xs hover:bg-accent">
            <ColorDot value={value} />
            <span className="flex-1 truncate text-left">{text}</span>
            <Caret />
          </button>
        }
      >
        <div className="flex flex-col gap-2 p-1">
          <div className="flex gap-1">
            <button type="button" className={chip(value === "auto")} onClick={() => pick("auto")}>
              <ColorDot value="auto" />
              自动
            </button>
            {allowNone && (
              <button type="button" className={chip(value === "transparent")} onClick={() => pick("none")}>
                <ColorDot value="transparent" />无{label}
              </button>
            )}
          </div>
          <ColorGrid columns={6} value={custom ? value! : undefined} customActive={custom} onCustom={onChange}>
            {colors.map((c) => (
              <Swatch key={c} label={c} fill={c} border={c === "#ffffff" ? "#d4d4d4" : c} active={value === c} onClick={() => pick(c)} />
            ))}
          </ColorGrid>
        </div>
      </Popover>
    </div>
  );
}

/** − value + number input. */
function Stepper({ value, min, max, step, label, onCommit }: { value: number | null; min: number; max: number; step: number; label: [string, string, string]; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => setText(value == null ? "" : String(Math.round(value * 10) / 10)), [value]);
  const commit = (v: number) => {
    const c = Math.min(max, Math.max(min, v));
    if (Number.isFinite(c) && c > 0 && c !== value) onCommit(c);
  };
  return (
    <div className="flex h-7 items-center rounded-lg border">
      <button type="button" aria-label={label[0]} className="flex h-full items-center px-2 hover:bg-accent" onClick={() => commit((value ?? min) - step)}>
        <Minus className="size-3.5" />
      </button>
      <input
        aria-label={label[1]}
        placeholder="混合"
        className="h-full w-full min-w-0 bg-transparent text-center text-xs tabular-nums outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => text && commit(Number(text))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button type="button" aria-label={label[2]} className="flex h-full items-center px-2 hover:bg-accent" onClick={() => commit((value ?? min) + step)}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function FillDot({ fill, stroke }: { fill?: string; stroke?: string }) {
  return <span className="size-3.5 rounded-full border-[1.5px]" style={{ borderColor: stroke ?? "currentColor", backgroundColor: !fill || fill === "transparent" ? "transparent" : fill }} />;
}
function FontGlyph({ color }: { color?: string }) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="text-[12px] font-medium tracking-tight">Aa</span>
      <span className="mt-0.5 h-[3px] w-4 rounded-full" style={{ backgroundColor: color ?? "currentColor" }} />
    </span>
  );
}
function StrokeGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="!size-[15px]" fill="currentColor">
      <rect x={2} y={3.5} width={12} height={1.2} rx={0.6} />
      <rect x={2} y={7} width={12} height={2} rx={1} />
      <rect x={2} y={11} width={12} height={2.8} rx={1.4} />
    </svg>
  );
}
function CornerGlyph({ round }: { round: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <path d={round ? "M3 13V8a5 5 0 0 1 5-5h5" : "M3 13V3h10"} />
    </svg>
  );
}

// ---------------- bar ----------------

/** Bottom properties bar for the current selection. */
export function SelectionBar() {
  const { api, ui, focusComment } = useEditor();
  if (!ui.selectedIds.length || ui.editingText || ui.busy) return null;
  const ids = new Set(ui.selectedIds);
  const all = api.getSceneElements();
  const selected = all.filter((e) => ids.has(e.id)) as ExcalidrawElement[];
  if (!selected.length) return null;
  const texts = all.filter((e) => e.type === "text" && (ids.has(e.id) || (e.containerId && ids.has(e.containerId)))) as ExcalidrawTextElement[];
  return <Bar selected={selected} texts={texts} focusComment={focusComment} />;
}

function Bar({ selected, texts, focusComment }: { selected: ExcalidrawElement[]; texts: ExcalidrawTextElement[]; focusComment: (o: { elementId?: string; x?: number; y?: number }) => void }) {
  const { api, openDialog, setPanel } = useEditor();
  const shapes = selected.map(shapeOf);
  const d0 = diagramOf(selected[0]);
  const diagram = d0 && selected.every((e) => diagramOf(e)?.id === d0.id) ? d0 : null;
  const single = selected.length === 1 ? selected[0] : null;
  const kind = single ? nodeKind(single as never) : null;
  const special = selected.some((e) => nodeKind(e as never)) || !!diagram;
  const allShapes = !special && shapes.every((s) => s !== null);
  const strokable = !special && selected.some((e) => !NO_STROKE_TYPES.has(e.type) && e.type !== "text");
  const anyText = texts.length > 0;
  const withText = selected.some(hasBoundText);
  const shapeId = commonValue(selected, shapeOf);

  const strokeColor = commonValue(selected, (e) => e.strokeColor);
  const base = commonValue(selected, baseColor);
  const mode = commonValue(selected, fillMode);
  const outline = new Set(selected.map((e) => ((e.customData as { outlineColor?: string })?.outlineColor ?? "auto") as string));
  const textOverride = new Set(selected.map((e) => ((e.customData as { textColor?: string })?.textColor ?? "auto") as string));
  const strokeWidth = commonValue(selected, (e) => e.strokeWidth);
  const strokeStyle = commonValue(selected, (e) => e.strokeStyle);
  const noOutline = allShapes && selected.every((e) => e.strokeColor === "transparent");
  const roundable = selected.every((e) => e.type === "rectangle" || e.type === "diamond") && !special;
  const rounded = commonValue(selected, (e) => !!e.roundness);
  const opacity = commonValue(selected, (e) => e.opacity);
  const locked = selected.every((e) => e.locked);

  const textColor = commonValue(texts, (e) => e.strokeColor);
  const fontSize = commonValue(texts, (e) => e.fontSize);
  const textAlign = commonValue(texts, (e) => e.textAlign);
  const fontFamily = commonValue(texts, (e) => e.fontFamily);
  const vAlign = commonValue(texts, (e) => e.verticalAlign);
  const lineHeight = commonValue(texts, (e) => e.lineHeight as number);
  const inContainer = texts.some((e) => e.containerId);
  const loneText = texts.length === 1 && selected.length === 1 && !texts[0].containerId ? texts[0] : null;

  const setWidth = (v: number) => updateSelected(api, { strokeWidth: v }, { currentItemStrokeWidth: v });
  const setStyle = (v: (typeof STROKE_STYLES)[number]["value"]) => {
    if (noOutline) setOutlineColor(api, "auto");
    updateSelected(api, { strokeStyle: v }, { currentItemStrokeStyle: v });
  };
  const setRound = (r: boolean) => updateSelected(api, (e) => ({ roundness: r ? { type: e.type === "diamond" ? 2 : 3 } : null }), { currentItemRoundness: r ? "round" : "sharp" });
  const setOpacity = (v: number, commit: boolean) => updateSelected(api, { opacity: v }, undefined, commit ? "immediate" : "preview");
  const setTextColor = (c: string, commit = true) => updateSelected(api, (e) => (e.type === "text" ? { strokeColor: c } : null), { currentItemStrokeColor: c }, commit ? "immediate" : "preview");
  const setLine = (v: number) => {
    const tids = new Set(texts.map((t) => t.id));
    updateElements(api, Object.fromEntries([...tids].map((id) => [id, { lineHeight: v } as never])));
    if (fontSize) runAction(api, "changeFontSize", fontSize);
  };
  const toShape = (id: string) => mapSelected(api, (e) => (!shapeOf(e) || (!isNativeShape(id) && hasBoundText(e)) ? null : convertShape(e, id)));
  const comment = () => focusComment({ elementId: selected[0].id, x: selected[0].x + selected[0].width, y: selected[0].y });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
      <div className="yx-properties-bar pointer-events-auto relative overflow-hidden rounded-lg border bg-popover p-[3px] shadow-xs/5">
        <div className="flex w-max items-center gap-0.5">
          {diagram && (
            <>
              <DiagramControls id={diagram.id} code={diagram.code} />
              <VSep />
            </>
          )}
          {single?.type === "frame" && (
            <>
              <FrameControls frame={single as never} />
              <VSep />
            </>
          )}
          {kind === "code" && (
            <>
              <SandboxControls el={single!} />
              <VSep />
            </>
          )}
          {kind === "chart" && (
            <>
              <ChartControls id={single!.id} />
              <VSep />
            </>
          )}
          {kind === "markdown" && (
            <>
              <button type="button" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-accent" onClick={() => setPanel({ kind: "markdown", id: single!.id })}>
                <NotebookPen className="size-4" />
                编辑 Markdown
              </button>
              <VSep />
            </>
          )}
          {kind === "codeblock" && (
            <>
              <CodeBlockControls el={single!} />
              <VSep />
            </>
          )}
          {kind === "link" && (
            <>
              <LinkCardControls el={single!} />
              <VSep />
            </>
          )}
          {single?.type === "embeddable" && !kind && single.link && (
            <>
              <WebEmbedControls el={single} />
              <VSep />
            </>
          )}

          {allShapes && (
            <Group icon={<ShapeIcon id={shapeId ?? "rectangle"} />} label="形状">
              <div className="grid grid-cols-7 gap-1">
                {SHAPES.map((s) => {
                  const active = shapes.every((x) => x === s.id);
                  const disabled = withText && !isNativeShape(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      title={disabled ? `${s.label}（含文字的图形只能切换为矩形 / 椭圆 / 菱形）` : s.label}
                      aria-label={s.label}
                      disabled={disabled}
                      className={cn("flex size-8 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-30", active ? "bg-[var(--highlight)] text-[var(--highlight-foreground)]" : "enabled:hover:bg-accent")}
                      onClick={() => toShape(s.id)}
                    >
                      <ShapeIcon id={s.id} className="size-[18px]" />
                    </button>
                  );
                })}
              </div>
            </Group>
          )}

          {allShapes && (
            <Group icon={<FillDot fill={commonValue(selected, (e) => e.backgroundColor)} stroke={strokeColor} />} label="颜色">
              <div className="flex w-[228px] flex-col gap-3 p-1">
                <div className="flex flex-col gap-1.5">
                  <Label>样式</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
                    {(["light", "solid"] as const).map((m) => (
                      <button key={m} type="button" className={cn("h-7 rounded-[5px] text-xs transition-colors", (mode === "none" ? "light" : mode) === m ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")} onClick={() => setFillMode(api, m)}>
                        {m === "light" ? "浅色" : "实色"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>颜色</Label>
                  <ColorGrid
                    columns={6}
                    value={base}
                    customActive={!!base && !isPaletteColor(base)}
                    onCustom={(c, commit) => setBaseColor(api, c, commit ? "immediate" : "preview")}
                    leading={<Swatch label="无填充" fill="transparent" border="#d4d4d4" active={mode === "none"} className={NO_FILL_BG} onClick={() => setFillMode(api, "none")} />}
                  >
                    {PALETTE.map((p) => (
                      <Swatch
                        key={p.id}
                        label={p.label}
                        fill={mode === "solid" ? p.stroke : p.light}
                        border={p.stroke}
                        active={sameColor(base, p.stroke)}
                        onClick={() => {
                          if (mode === "none") setFillMode(api, "light");
                          setBaseColor(api, p.stroke);
                        }}
                      />
                    ))}
                  </ColorGrid>
                </div>
                <div className="-mx-1 h-px bg-border" />
                <OverrideColor label="边框" value={outline.size === 1 ? [...outline][0] : null} allowNone onChange={(c, commit) => setOutlineColor(api, c, commit ? "immediate" : "preview")} />
                <OverrideColor label="文字" value={textOverride.size === 1 ? [...textOverride][0] : null} extra={["#ffffff", "#1e1e1e"]} onChange={(c, commit) => setTextColorOverride(api, c, commit ? "immediate" : "preview")} />
              </div>
            </Group>
          )}

          {strokable && (
            <Group icon={<StrokeGlyph />} label="描边">
              <div className="flex w-[228px] flex-col gap-3 p-1">
                <div className="flex flex-col gap-1.5">
                  <Label>粗细</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {STROKE_WIDTHS.map((w) => (
                      <button key={w.value} type="button" title={`${w.value}px`} aria-label={`粗细 ${w.value}`} className={optionCls(strokeWidth === w.value)} onClick={() => setWidth(w.value)}>
                        <span className="w-6">
                          <LineSample width={Math.min(w.value, 5)} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <Stepper value={strokeWidth ?? null} min={0.5} max={MAX_STROKE} step={0.5} label={["变细", "描边粗细", "变粗"]} onCommit={setWidth} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>线型</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {STROKE_STYLES.map((s) => (
                      <button key={s.value} type="button" title={s.label} aria-label={s.label} className={optionCls(!noOutline && strokeStyle === s.value)} onClick={() => setStyle(s.value)}>
                        <span className="w-6">
                          <LineSample dash={s.dash} />
                        </span>
                      </button>
                    ))}
                    {allShapes && (
                      <button type="button" title="无边框" aria-label="无边框" className={optionCls(noOutline)} onClick={() => setOutlineColor(api, "none")}>
                        <Ban className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
                {roundable && (
                  <div className="flex flex-col gap-1.5">
                    <Label>圆角</Label>
                    <div className="grid grid-cols-2 gap-1">
                      {[false, true].map((r) => (
                        <button key={String(r)} type="button" title={r ? "圆角" : "直角"} aria-label={r ? "圆角" : "直角"} className={optionCls(rounded === r)} onClick={() => setRound(r)}>
                          <CornerGlyph round={r} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!allShapes && (
                  <div className="flex flex-col gap-1.5">
                    <Label>颜色</Label>
                    <ColorGrid value={strokeColor} customActive={!!strokeColor && !isPaletteColor(strokeColor)} onCustom={(c, commit) => setStrokeColor(api, c, commit ? "immediate" : "preview")}>
                      {PALETTE.map((p) => (
                        <Swatch key={p.id} label={p.label} fill={p.stroke} border={p.stroke} active={sameColor(strokeColor, p.stroke)} onClick={() => setStrokeColor(api, p.stroke)} />
                      ))}
                    </ColorGrid>
                  </div>
                )}
              </div>
            </Group>
          )}
          {(allShapes || strokable) && <VSep />}

          {anyText && !diagram && (
            <>
              <Group icon={<FontGlyph color={textColor} />} label="字体">
                <div className="flex w-[212px] flex-col gap-2 p-1">
                  <div className="flex flex-col gap-0.5">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        title={`${f.label}（中文 ${f.cjk}）`}
                        className={cn("flex h-8 items-center rounded-md px-2 text-[14px]", fontFamily === f.id ? "bg-[var(--highlight)] text-[var(--highlight-foreground)]" : "hover:bg-accent")}
                        onClick={() => runAction(api, "changeFontFamily", { currentItemFontFamily: f.id })}
                      >
                        <span style={{ fontFamily: f.css }}>{f.label}</span>
                      </button>
                    ))}
                  </div>
                  <HSep />
                  <Stepper value={fontSize ?? null} min={1} max={MAX_FONT} step={1} label={["减小字号", "字号", "增大字号"]} onCommit={(v) => runAction(api, "changeFontSize", v)} />
                  <div className="grid grid-cols-4 gap-1">
                    {FONT_SIZES.map((s) => (
                      <button key={s.value} type="button" title={`${s.value}px`} className={optionCls(fontSize === s.value)} onClick={() => runAction(api, "changeFontSize", s.value)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <HSep />
                  <Label>文字颜色</Label>
                  <ColorGrid columns={6} value={textColor} customActive={!!textColor && !isPaletteColor(textColor)} onCustom={(c, commit) => setTextColor(c, commit)}>
                    {[...PALETTE.map((p) => p.stroke), "#ffffff"].map((c) => (
                      <Swatch key={c} label={c} fill={c} border={c === "#ffffff" ? "#d4d4d4" : c} active={sameColor(textColor, c)} onClick={() => setTextColor(c)} />
                    ))}
                  </ColorGrid>
                </div>
              </Group>
              <Group icon={<Pilcrow />} label="段落">
                <div className="flex w-[196px] flex-col gap-3 p-1">
                  <div className="grid grid-cols-3 gap-1">
                    {H_ALIGNS.map((a) => (
                      <button key={a.value} type="button" title={a.label} aria-label={a.label} className={cn(optionCls(textAlign === a.value), "[&_svg]:size-4")} onClick={() => runAction(api, "changeTextAlign", a.value)}>
                        {a.icon}
                      </button>
                    ))}
                    {V_ALIGNS.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        disabled={!inContainer}
                        title={inContainer ? a.label : `${a.label}（仅图形内文字）`}
                        aria-label={a.label}
                        className={cn(optionCls(inContainer && vAlign === a.value), "disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4")}
                        onClick={() => runAction(api, "changeVerticalAlign", a.value)}
                      >
                        {a.icon}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>行高</Label>
                    <div className="grid grid-cols-4 gap-1">
                      {LINE_HEIGHTS.map((v) => (
                        <button key={v} type="button" className={cn(optionCls(lineHeight === v), "tabular-nums")} onClick={() => setLine(v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Group>
              <VSep />
            </>
          )}

          <Group icon={<span className="min-w-8 text-[13px] tabular-nums">{opacity === undefined ? "混合" : `${opacity}%`}</span>} label="透明度">
            <div className="flex w-[196px] flex-col gap-3 p-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">透明度</span>
                <span className="tabular-nums">{opacity === undefined ? "混合" : `${opacity}%`}</span>
              </div>
              <input type="range" aria-label="透明度" min={0} max={100} step={1} defaultValue={opacity ?? 100} className="w-full accent-neutral-800" onInput={(e) => setOpacity(Number(e.currentTarget.value), false)} onChange={(e) => setOpacity(Number(e.currentTarget.value), true)} />
              <div className="grid grid-cols-4 gap-1">
                {OPACITIES.map((v) => (
                  <button key={v} type="button" className={cn(optionCls(opacity === v), "tabular-nums")} onClick={() => setOpacity(v, true)}>
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </Group>
          <Group icon={<Layers />} label="层级">
            <div className="grid grid-cols-4 gap-1 p-1">
              {LAYERS.map((l) => (
                <button key={l.value} type="button" title={`${l.label}（${l.shortcut}）`} aria-label={l.label} className={cn(optionCls(false), "size-9 [&_svg]:size-4")} onClick={() => reorder(api, l.value)}>
                  {l.icon}
                </button>
              ))}
            </div>
          </Group>
          <VSep />
          <BarButton icon={<MessageSquare />} label="添加评论" onClick={comment} />
          <Menu side="top" align="start" sideOffset={8} className="min-w-52" trigger={<BarButton icon={<Ellipsis />} label="更多" />}>
            {loneText && (
              <>
                <MenuItem onClick={() => convertText(api, loneText.id, (code) => createCodeBlock(code, Math.min(22, Math.max(12, loneText.fontSize)) ))}>
                  <Code />
                  转为代码块
                </MenuItem>
                <MenuItem onClick={() => convertText(api, loneText.id, (source, w) => createNode("markdown", Math.max(480, w + 40), 120, { source }))}>
                  <NotebookPen />
                  转为 Markdown
                </MenuItem>
                <MenuSeparator />
              </>
            )}
            <SubMenu label="复制 / 粘贴为" icon={<Copy />}>
              <MenuItem onClick={() => copyAsPng(api).then((copied) => (copied ? toast.success("已复制为 PNG") : toast.info("当前不是 HTTPS 访问，浏览器不允许写入图片剪贴板，已改为下载 PNG")), () => toast.error("复制失败"))}>复制为 PNG</MenuItem>
              <MenuItem onClick={() => copyAsSvg(api).then(() => toast.success("已复制为 SVG"), () => toast.error("复制失败"))}>复制为 SVG</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => copyStyle(api)}>
                复制样式
                <span className="ml-auto text-xs text-muted-foreground">{`${MOD}${ALT}C`}</span>
              </MenuItem>
              <MenuItem disabled={!hasCopiedStyle()} onClick={() => pasteStyle(api)}>
                粘贴样式
                <span className="ml-auto text-xs text-muted-foreground">{`${MOD}${ALT}V`}</span>
              </MenuItem>
            </SubMenu>
            <MenuItem onClick={() => openDialog({ kind: "export", scope: "selection" })}>
              <Download />
              导出选中…
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => wrapInFrame(api)}>
              <SquareDashed />
              创建画框
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => setLocked(api, !locked)}>
              {locked ? <LockOpen /> : <Lock />}
              {locked ? "解锁" : "锁定"}
            </MenuItem>
            <MenuItem destructive onClick={() => deleteSelected(api)}>
              <Trash2 />
              删除
            </MenuItem>
          </Menu>
        </div>
      </div>
    </div>
  );
}

function NodeButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] whitespace-nowrap hover:bg-accent [&_svg]:size-4" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

// ---------------- custom node controls ----------------

