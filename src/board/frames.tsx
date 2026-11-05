import { Check, CircleDot, Frame, Link, Radio, Scan, SquareDashed, X } from "lucide-react";
import { newElementWith } from "@excalidraw/excalidraw";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input, Popover, Tooltip } from "@/components/ui";
import { cn, copyText } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { updateSelected } from "./ops";
import type { API } from "./scene";

type FrameStatus = { label: string; tone: string; animation?: boolean };
type FrameEl = { id: string; x: number; y: number; width: number; height: number; name: string | null; version: number; customData?: { status?: FrameStatus } };

const TONES = [
  { value: "primary", label: "蓝", color: "#2451d4", background: "#dceaff" },
  { value: "success", label: "绿", color: "#168026", background: "#dcffdf" },
  { value: "warning", label: "琥珀", color: "#956400", background: "#fff3d9" },
  { value: "danger", label: "红", color: "#c71d25", background: "#fbdcdd" },
  { value: "info", label: "灰", color: "#6b7280", background: "#f3f4f6" },
  { value: "cyan", label: "青", color: "#13747a", background: "#d9fcfc" },
  { value: "purple", label: "紫", color: "#b408c1", background: "#fbdcfc" },
  { value: "orange", label: "橙", color: "#bd3214", background: "#fbddde" },
];
const toneOf = (v?: string) => TONES.find((t) => t.value === v) ?? TONES[0];
const statusOf = (f: { customData?: Record<string, unknown> }) => {
  const s = f.customData?.status as FrameStatus | undefined;
  return s && typeof s.label === "string" ? s : null;
};
const PILL_HEIGHT = 20;
const PILL_GAP = 6;

function setStatus(api: API, id: string, status: FrameStatus | null) {
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((e) => {
      if (e.id !== id || e.type !== "frame") return e;
      const { status: _old, ...rest } = (e.customData ?? {}) as Record<string, unknown>;
      return newElementWith(e, { customData: status ? { ...rest, status } : rest });
    }),
    captureUpdate: "IMMEDIATELY",
  });
}

function Pill({ status, height = PILL_HEIGHT }: { status: FrameStatus; height?: number }) {
  const t = toneOf(status.tone);
  return (
    <div className="flex items-center overflow-hidden rounded-full font-sans font-medium whitespace-nowrap" style={{ height, background: t.background, color: t.color, paddingInline: height / 3, gap: height * 0.21, fontSize: height * 0.5, lineHeight: 1 }}>
      <span className="relative shrink-0 rounded-full" style={{ width: height / 4, height: height / 4, background: t.color }}>
        {status.animation && <span className="yx-status-pulse absolute inset-0 rounded-full bg-inherit" />}
      </span>
      <span className="min-w-0 truncate">{status.label}</span>
    </div>
  );
}

/** Status pills placed right after each frame's name label. */
export function FrameStatusPills() {
  const { api, ui } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  const frames = (api.getSceneElements().filter((e) => e.type === "frame") as unknown as FrameEl[]).filter((f) => statusOf(f));
  const [pos, setPos] = useState<Record<string, { left: number; top: number }>>({});
  useLayoutEffect(() => {
    const measure = () => {
      const host = root.current?.parentElement;
      const editor = root.current?.closest(".board-editor");
      if (!host || !editor) return;
      const box = host.getBoundingClientRect();
      const next: Record<string, { left: number; top: number }> = {};
      for (const f of frames) {
        const label = editor.querySelector(`[id$="-frame-name-${CSS.escape(f.id)}"]`);
        if (!label) continue;
        const r = label.getBoundingClientRect();
        next[f.id] = { left: Math.round(r.right - box.left + PILL_GAP), top: Math.round(r.top - box.top + (r.height - PILL_HEIGHT) / 2) };
      }
      setPos((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  });
  void ui;
  return (
    <div ref={root} className="contents">
      {frames.map((f) => {
        const p = pos[f.id];
        const s = statusOf(f);
        if (!p || !s) return null;
        return (
          <div
            key={f.id}
            role="button"
            title="画框状态（选中画框后在属性栏修改）"
            className="pointer-events-auto absolute z-[3] cursor-pointer"
            style={{ left: p.left, top: p.top }}
            onPointerDown={(e) => {
              e.preventDefault();
              api.updateScene({ appState: { selectedElementIds: { [f.id]: true } } as never, captureUpdate: "NEVER" });
            }}
          >
            <Pill status={s} />
          </div>
        );
      })}
    </div>
  );
}

function ToneDot({ tone, className }: { tone: (typeof TONES)[number]; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center rounded-full", className)} style={{ background: tone.background, boxShadow: `inset 0 0 0 1px ${tone.color}33` }}>
      <span className="size-[35%] rounded-full" style={{ background: tone.color }} />
    </span>
  );
}

/** Frame status editor: label, tone, pulse animation, remove. */
function StatusEditor({ frameId, status }: { frameId: string; status: FrameStatus | null }) {
  const { api } = useEditor();
  const [label, setLabel] = useState(status?.label ?? "");
  useEffect(() => setLabel(status?.label ?? ""), [status?.label]);
  const base = status ?? { label: "进行中", tone: "primary", animation: true };
  const apply = (p: Partial<FrameStatus>) => setStatus(api, frameId, { ...base, ...p });
  return (
    <Popover
      side="top"
      className="w-56 p-2"
      trigger={
        <button type="button" aria-label="画框状态" title="画框状态" className="bar-toggle with-caret">
          {status ? <ToneDot tone={toneOf(status.tone)} className="size-4" /> : <CircleDot />}
          <svg aria-hidden viewBox="0 0 8 8" className="caret size-2 shrink-0 opacity-50" fill="currentColor">
            <path d="M1 2.5h6L4 6z" />
          </svg>
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <Input
          aria-label="状态文案"
          className="h-7"
          placeholder="状态文案，如：进行中"
          maxLength={40}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const v = label.trim();
            if (v && v !== status?.label) apply({ label: v });
            else setLabel(status?.label ?? "");
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <div className="grid grid-cols-4 gap-1.5">
          {TONES.map((t) => (
            <button
              key={t.value}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={status?.tone === t.value}
              className={cn("flex size-8 items-center justify-center justify-self-center rounded-full transition-transform hover:scale-110", status?.tone === t.value && "ring-2 ring-offset-1 ring-offset-popover")}
              style={{ "--tw-ring-color": t.color } as React.CSSProperties}
              onClick={() => apply({ tone: t.value, label: label.trim() || base.label })}
            >
              <ToneDot tone={t} className="size-7" />
            </button>
          ))}
        </div>
        {status && (
          <div className="flex items-center gap-1">
            <button type="button" aria-pressed={!!status.animation} title={status.animation ? "关闭圆点动画" : "开启圆点动画"} className="bar-toggle" onClick={() => apply({ animation: !status.animation })}>
              <Radio />
            </button>
            <button type="button" className="ms-auto flex h-8 items-center gap-1 rounded-md px-2 text-xs text-destructive-foreground hover:bg-accent" onClick={() => setStatus(api, frameId, null)}>
              <X className="size-3.5" />
              移除状态
            </button>
          </div>
        )}
      </div>
    </Popover>
  );
}
const ROW_TOLERANCE = 80;
const CORNERS = ["tl", "tr", "bl", "br"] as const;

function useFrames(): FrameEl[] {
  const { api } = useEditor();
  return api.getSceneElements().filter((e) => e.type === "frame") as unknown as FrameEl[];
}

const frameLabel = (f: FrameEl, i: number) => f.name?.trim() || `画框 ${i + 1}`;

/** Thin frame outlines (Excalidraw's own outline is off), highlighted with handles when selected. */
export function FrameOutlines() {
  const { ui } = useEditor();
  const frames = useFrames();
  if (!frames.length) return null;
  const sel = new Set(ui.selectedIds);
  const selected = frames.filter((f) => sel.has(f.id));
  return (
    <>
      {frames.map((f) => {
        const on = sel.has(f.id);
        return (
          <div
            key={f.id}
            className={cn("pointer-events-none absolute z-[2] rounded-[2px] border", on ? "border-[var(--yx-selection)] shadow-[0_0_0_1px_var(--yx-selection)]" : "border-[var(--yx-frame-border)]")}
            style={{ left: (f.x + ui.scrollX) * ui.zoom, top: (f.y + ui.scrollY) * ui.zoom, width: f.width * ui.zoom, height: f.height * ui.zoom }}
          >
            {on &&
              CORNERS.map((c) => (
                <span key={c} className={cn("absolute size-[9px] rounded-full border-[1.5px] border-[var(--yx-selection)] bg-background", c[0] === "t" ? "-top-[5px]" : "-bottom-[5px]", c[1] === "l" ? "-left-[5px]" : "-right-[5px]")} />
              ))}
          </div>
        );
      })}
      {selected.length > 0 && (
        <style>{`${selected.map((f) => `[id$="-frame-name-${CSS.escape(f.id)}"]`).join(",")}{border-color:var(--yx-selection)!important;color:var(--foreground)!important}`}</style>
      )}
    </>
  );
}

/** Top-right frame list with search; picking one zooms to it. */
export function FrameNav() {
  const { api } = useEditor();
  const frames = useFrames();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const ordered = useMemo(
    () => frames.map((f, i) => ({ frame: f, label: frameLabel(f, i) })).sort((a, b) => (Math.abs(a.frame.y - b.frame.y) > ROW_TOLERANCE ? a.frame.y - b.frame.y : a.frame.x - b.frame.x)),
    [frames],
  );
  const term = q.trim().toLowerCase();
  const list = term ? ordered.filter((f) => f.label.toLowerCase().includes(term)) : ordered;
  const current = useMemo(() => {
    if (!open) return null;
    const { scrollX, scrollY, width, height, zoom } = api.getAppState();
    const cx = width / 2 / zoom.value - scrollX;
    const cy = height / 2 / zoom.value - scrollY;
    return frames.find((f) => cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height)?.id ?? null;
  }, [open, api, frames]);
  if (!frames.length) return null;
  const go = (id: string) => {
    const el = api.getSceneElements().find((e) => e.id === id);
    if (el) api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.9, maxZoom: 1, animate: true });
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQ("");
          setActive(0);
        }
      }}
      align="end"
      className="w-64 p-2"
      trigger={
        <button type="button" aria-label="画框导航" title={`画框导航（${frames.length}）`} className="flex size-7 items-center justify-center rounded-md hover:bg-accent">
          <Frame className="size-4" />
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <Input
          autoFocus
          type="search"
          className="h-7"
          placeholder="搜索画框"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const d = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + d + list.length) % Math.max(list.length, 1));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              go(list[active].frame.id);
            }
          }}
        />
        <div className="-mx-1 flex max-h-72 flex-col overflow-y-auto">
          {list.map(({ frame, label }, i) => (
            <button key={frame.id} type="button" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === active ? "bg-accent" : "hover:bg-accent/60")} onMouseEnter={() => setActive(i)} onClick={() => go(frame.id)}>
              <SquareDashed className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {frame.id === current && <span className="shrink-0 text-xs text-muted-foreground">当前</span>}
            </button>
          ))}
          {!list.length && <div className="py-6 text-center text-sm text-muted-foreground">无匹配的画框</div>}
        </div>
      </div>
    </Popover>
  );
}

export const frameLink = (id: string) => {
  const u = new URL(window.location.href);
  u.hash = `frame=${encodeURIComponent(id)}`;
  return u.toString();
};

/** Opens the frame named in `#frame=` once the scene is ready. */
export function focusFrameFromHash(api: API) {
  const id = new URLSearchParams(window.location.hash.slice(1)).get("frame");
  const el = id && api.getSceneElements().find((e) => e.id === id && e.type === "frame");
  if (!el) return;
  api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true });
  api.updateScene({ appState: { selectedElementIds: { [el.id]: true } } as never });
}

/** Properties-bar controls for a single selected frame: name, copy link, zoom to it. */
export function FrameControls({ frame }: { frame: FrameEl }) {
  const { api } = useEditor();
  const [name, setName] = useState(frame.name ?? "");
  const [copied, setCopied] = useState(false);
  const typed = useRef(false);
  useEffect(() => setName(frame.name ?? ""), [frame.id, frame.name]);
  const rename = (v: string, commit: boolean) => updateSelected(api, (e) => (e.id === frame.id ? ({ name: v } as never) : null), undefined, commit ? "immediate" : "preview");
  return (
    <>
      <Input
        aria-label="画框名称"
        className="h-7 w-44 shadow-none"
        value={name}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          typed.current = true;
          setName(e.target.value);
          rename(e.target.value, false);
        }}
        onBlur={() => {
          if (!typed.current) return;
          typed.current = false;
          rename(name.trim() || "画框", true);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <StatusEditor frameId={frame.id} status={statusOf(frame)} />
      <button
        type="button"
        className="ms-1 flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[13px] hover:bg-accent"
        onClick={async () => {
          await copyText(frameLink(frame.id));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Link className="size-3.5" />}
        {copied ? "已复制" : "复制链接"}
      </button>
      <Tooltip content="缩放到画框">
        <button
          type="button"
          aria-label="缩放到画框"
          className="bar-toggle ms-1"
          onClick={() => {
            const el = api.getSceneElements().find((e) => e.id === frame.id);
            if (el) api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true });
          }}
        >
          <Scan />
        </button>
      </Tooltip>
    </>
  );
}
