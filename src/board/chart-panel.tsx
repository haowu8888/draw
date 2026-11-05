import { Popover as BPopover } from "@base-ui/react/popover";
import { Plus, SlidersHorizontal, Table2, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CHART_ICONS, CHART_TYPES, PALETTES, type ChartConfig, type ChartType } from "./chart";
import { useEditor } from "./editor-context";
import { updateNodeData } from "./ops";
import type { API } from "./scene";

const chartOf = (api: API, id: string) => (api.getSceneElements().find((e) => e.id === id)?.customData as { chart?: ChartConfig } | undefined)?.chart;
const isPie = (t: ChartType) => t === "pie" || t === "donut";

/** Applies `patch` to the chart config of node `id` (preview = live, no history). */
function patchChart(api: API, id: string, patch: Partial<ChartConfig>, mode: "preview" | "immediate" = "immediate") {
  const cur = chartOf(api, id);
  if (cur) updateNodeData(api, id, { chart: { ...cur, ...patch } }, mode);
}

function ChartIcon({ type, className }: { type: ChartType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-[15px]"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={CHART_ICONS[type]} />
    </svg>
  );
}

function Pop({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <BPopover.Root open={open} onOpenChange={setOpen}>
      <BPopover.Trigger
        render={
          <button type="button" aria-label={label} title={label} aria-pressed={open} className="bar-toggle with-caret">
            {icon}
            <svg aria-hidden viewBox="0 0 8 8" className="caret size-2 shrink-0 opacity-50" fill="currentColor">
              <path d="M1 2.5h6L4 6z" />
            </svg>
          </button>
        }
      />
      <BPopover.Portal>
        <BPopover.Positioner side="top" sideOffset={8} className="z-50">
          <BPopover.Popup className="rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg/5 outline-none">{children}</BPopover.Popup>
        </BPopover.Positioner>
      </BPopover.Portal>
    </BPopover.Root>
  );
}

const fieldCls = "h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring";
const stop = (e: React.KeyboardEvent<HTMLInputElement>) => {
  e.stopPropagation();
  if (e.key === "Enter") e.currentTarget.blur();
};

/** Properties-bar controls for a chart node: type, settings, data table. */
export function ChartControls({ id }: { id: string }) {
  const { api, panel, setPanel } = useEditor();
  const chart = chartOf(api, id);
  if (!chart) return null;
  const change = (p: Partial<ChartConfig>) => patchChart(api, id, p);
  const preview = (p: Partial<ChartConfig>) => patchChart(api, id, p, "preview");
  const commit = () => patchChart(api, id, {}, "immediate");
  const row = (label: string, control: React.ReactNode) => (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="shrink-0 text-[12px]">{label}</span>
      {control}
    </div>
  );
  const segment = <K extends keyof ChartConfig>(key: K, options: { value: ChartConfig[K]; label: string }[]) => (
    <div className="flex rounded-md bg-muted/70 p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={cn("h-6 min-w-7 rounded-[5px] px-1.5 text-[11px] tabular-nums transition-colors", chart[key] === o.value ? "bg-background font-medium shadow-xs/5" : "text-muted-foreground hover:text-foreground")} onClick={() => change({ [key]: o.value } as Partial<ChartConfig>)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  const toggle = (key: keyof ChartConfig) => (
    <button
      type="button"
      role="switch"
      aria-checked={!!chart[key]}
      className={cn("relative h-4 w-7 rounded-full transition-colors", chart[key] ? "bg-[var(--highlight)]" : "bg-input")}
      onClick={() => change({ [key]: !chart[key] } as Partial<ChartConfig>)}
    >
      <span className={cn("absolute top-0.5 size-3 rounded-full bg-white shadow transition-[left]", chart[key] ? "left-3.5" : "left-0.5")} />
    </button>
  );
  const text = (key: "title" | "subtitle" | "prefix" | "suffix", placeholder: string) => (
    <input aria-label={placeholder} placeholder={placeholder} className={fieldCls} value={chart[key] ?? ""} onChange={(e) => preview({ [key]: e.target.value })} onBlur={commit} onKeyDown={stop} />
  );
  const section = (title: string, children: React.ReactNode, first = false) => (
    <>
      {!first && <div className="-mx-1 my-2 h-px bg-border" />}
      <span className="pb-1 text-[11px] font-medium text-muted-foreground">{title}</span>
      {children}
    </>
  );
  const dataOpen = panel?.kind === "chart" && panel.id === id;
  return (
    <>
      <Pop icon={<ChartIcon type={chart.type} />} label="图表类型">
        <div className="grid w-[216px] grid-cols-3 gap-1 p-0.5">
          {CHART_TYPES.map((t) => (
            <button key={t.value} type="button" className={cn("flex h-14 flex-col items-center justify-center gap-1 rounded-md text-xs", t.value === chart.type ? "bg-accent font-medium" : "hover:bg-accent/60")} onClick={() => t.value !== chart.type && change({ type: t.value })}>
              <ChartIcon type={t.value} className="size-[18px]" />
              {t.label}
            </button>
          ))}
        </div>
      </Pop>
      <Pop icon={<SlidersHorizontal />} label="图表设置">
        <div className="flex max-h-[min(64vh,560px)] w-[268px] flex-col overflow-y-auto overscroll-contain p-1">
          {section(
            "常规",
            <>
            <div className="py-0.5">{text("title", "图表标题")}</div>
            <div className="py-0.5">{text("subtitle", "副标题（可选）")}</div>
            {row(
              "图例位置",
              segment("legend", [
                { value: "top", label: "上" },
                { value: "bottom", label: "下" },
                { value: "right", label: "右" },
                { value: "none", label: "无" },
              ]),
            )}
            </>,
            true,
          )}
          {section(
            "数据与数值",
            <>
            {row("数据标签", toggle("dataLabels"))}
            {row(
              "前缀 / 后缀",
              <div className="flex w-[132px] gap-1">
                {text("prefix", "前缀")}
                {text("suffix", "后缀")}
              </div>,
            )}
            {row(
              "小数位",
              segment("decimals", [
                { value: undefined, label: "自动" },
                { value: 0, label: "0" },
                { value: 1, label: "1" },
                { value: 2, label: "2" },
              ]),
            )}
            {row("大数缩写", toggle("abbreviate"))}
            </>,
          )}
          {(chart.type === "bar" || chart.type === "area" || chart.type === "line" || chart.type === "donut") &&
            section(
              CHART_TYPES.find((t) => t.value === chart.type)!.label,
              <>
              {(chart.type === "bar" || chart.type === "area") && row("堆叠", toggle("stacked"))}
              {chart.type === "bar" && row("横向（条形图）", toggle("horizontal"))}
              {(chart.type === "line" || chart.type === "area") && row("平滑曲线", toggle("smooth"))}
              {chart.type === "donut" && row("中心显示合计", toggle("showTotal"))}
              </>,
            )}
          {section(
            "配色",
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(PALETTES).map(([key, p]) => (
                <button key={key} type="button" title={p.label} className={cn("flex h-7 items-center gap-1.5 rounded-md border px-1.5 text-[11px]", chart.palette === key ? "border-[var(--highlight)] bg-[var(--highlight)]/8" : "border-transparent hover:bg-accent")} onClick={() => change({ palette: key })}>
                  <span className="flex h-3 overflow-hidden rounded-[3px]">
                    {p.colors.slice(0, 5).map((c) => (
                      <span key={c} className="w-2.5" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  {p.label}
                </button>
              ))}
            </div>,
          )}
        </div>
      </Pop>
      <button type="button" aria-pressed={dataOpen} className="bar-toggle with-caret gap-1.5 text-[13px]" onClick={() => setPanel(dataOpen ? null : { kind: "chart", id })}>
        <Table2 />
        数据
      </button>
    </>
  );
}

const cellCls = "h-7 w-full min-w-0 rounded-md border border-transparent bg-muted/50 px-2 text-xs outline-none hover:border-input focus:border-ring focus:bg-background disabled:opacity-70";

/** Floating data table next to the chart; edits preview live and commit on blur. */
export function ChartDataCard({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, ui } = useEditor();
  const card = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 360 });
  useLayoutEffect(() => {
    const el = card.current;
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  const el = api.getSceneElements().find((e) => e.id === id);
  const chart = chartOf(api, id);
  if (!el || !chart) return null;
  const quadrant = chart.type === "quadrant";
  const single = isPie(chart.type);
  const cols = single ? chart.series.slice(0, 1) : chart.series;
  const preview = (p: Partial<ChartConfig>) => patchChart(api, id, p, "preview");
  const commit = () => patchChart(api, id, {}, "immediate");
  const change = (p: Partial<ChartConfig>) => patchChart(api, id, p);
  const setLabel = (i: number, v: string) => preview({ labels: chart.labels.map((l, j) => (j === i ? v : l)) });
  const setName = (si: number, v: string) => preview({ series: chart.series.map((s, j) => (j === si ? { ...s, name: v } : s)) });
  const setValue = (si: number, li: number, v: string) => {
    const n = v.trim() === "" || Number.isNaN(Number(v)) ? 0 : Number(v);
    preview({ series: chart.series.map((s, j) => (j === si ? { ...s, data: chart.labels.map((_, k) => (k === li ? n : (s.data[k] ?? 0))) } : s)) });
  };
  const addRow = () => change({ labels: [...chart.labels, quadrant ? `点 ${chart.labels.length + 1}` : `分类 ${chart.labels.length + 1}`], series: chart.series.map((s) => ({ ...s, data: [...chart.labels.map((_, k) => s.data[k] ?? 0), 0] })) });
  const removeRow = (i: number) => change({ labels: chart.labels.filter((_, j) => j !== i), series: chart.series.map((s) => ({ ...s, data: s.data.filter((_, j) => j !== i) })) });
  const addSeries = () => change({ series: [...chart.series, { name: `系列 ${chart.series.length + 1}`, data: chart.labels.map(() => 0) }] });
  const removeSeries = (i: number) => change({ series: chart.series.filter((_, j) => j !== i) });
  const canRemoveSeries = !quadrant && !single && chart.series.length > 1;

  // beside the chart: right if it fits, else left, else clamped inside the canvas
  const right = (el.x + el.width + ui.scrollX) * ui.zoom + 12;
  const leftSide = (el.x + ui.scrollX) * ui.zoom - 12 - size.w;
  const left = right + size.w <= ui.width - 8 ? right : leftSide >= 8 ? leftSide : Math.max(8, ui.width - size.w - 8);
  const top = Math.max(8, Math.min((el.y + ui.scrollY) * ui.zoom, ui.height - size.h - 72));
  const grid = { gridTemplateColumns: `minmax(0,1fr) repeat(${cols.length}, minmax(0,1fr)) 20px` };

  return (
    <div
      ref={card}
      className="pointer-events-auto absolute z-20 flex w-max max-w-[520px] min-w-[260px] flex-col rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg/5"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">图表数据</span>
        <button type="button" aria-label="关闭" className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        <div className="grid items-center gap-1.5" style={grid}>
          <input className={cn(cellCls, "text-muted-foreground")} value={quadrant ? "名称" : "-"} disabled />
          {cols.map((s, si) => (
            <div key={si} className="group relative">
              <input aria-label="列名" className={cn(cellCls, "font-medium")} value={quadrant ? (si === 0 ? "X" : "Y") : s.name} disabled={quadrant} onChange={(e) => setName(si, e.target.value)} onBlur={commit} onKeyDown={stop} />
              {canRemoveSeries && (
                <button type="button" aria-label="删除列" className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full border bg-background text-muted-foreground group-hover:flex hover:text-foreground" onClick={() => removeSeries(si)}>
                  <X className="size-2.5" />
                </button>
              )}
            </div>
          ))}
          <span />
          {chart.labels.map((label, li) => (
            <div key={li} className="contents">
              <input aria-label="行标签" className={cn(cellCls, "font-medium")} value={label} onChange={(e) => setLabel(li, e.target.value)} onBlur={commit} onKeyDown={stop} />
              {cols.map((s, si) => (
                <input key={si} aria-label={`${s.name} 数值`} inputMode="decimal" className={cn(cellCls, "tabular-nums")} value={s.data[li] ?? ""} onChange={(e) => setValue(si, li, e.target.value)} onBlur={commit} onKeyDown={stop} />
              ))}
              <button type="button" aria-label="删除行" disabled={chart.labels.length <= 1} className="flex size-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground disabled:opacity-30" onClick={() => removeRow(li)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-1 border-t pt-2">
        <button type="button" className="flex h-7 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent" onClick={addRow}>
          <Plus className="size-3.5" />
          {quadrant ? "数据点" : "行"}
        </button>
        {!quadrant && !single && (
          <button type="button" className="flex h-7 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent" onClick={addSeries}>
            <Plus className="size-3.5" />
            系列
          </button>
        )}
      </div>
    </div>
  );
}
