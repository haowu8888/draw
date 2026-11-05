import { Popover as BPopover } from "@base-ui/react/popover";
import { convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useQuery } from "@tanstack/react-query";
import { CodeXml, ExternalLink, Link2, Lock, Monitor, RefreshCw, RotateCwSquare, Smartphone, Tablet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Menu, MenuItem } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { CODE_BLOCK_LANGUAGES, codeBlockSize, highlightCode, languageLabel, useHighlighter } from "./codeblock";
import { buildSrcDoc } from "./sandbox";
import { createEmbeddable, createNode, type API } from "./scene";

const Caret = () => (
  <svg aria-hidden viewBox="0 0 8 8" className="caret size-2 shrink-0 opacity-50" fill="currentColor">
    <path d="M1 2.5h6L4 6z" />
  </svg>
);
const barBtn = "flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] whitespace-nowrap hover:bg-accent [&_svg]:size-4";

/** Two-way segmented switch (文本/代码, 网页/卡片). */
function ModeSwitch<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md border text-[13px]">
      {options.map((o) => (
        <button key={o.value} type="button" className={cn("h-full px-2.5", value === o.value ? "bg-accent font-medium" : "hover:bg-accent/60")} onClick={() => value !== o.value && onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} className="bar-toggle ms-1 disabled:opacity-40" onClick={onClick}>
      {children}
    </button>
  );
}

/** Normalizes user input to an http(s) URL, or null. */
export function normalizeUrl(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Swaps element `id` for `next` at the same position, keeping groups/frame, and selects it. */
function replaceWith(api: API, id: string, next: ExcalidrawElement) {
  const scene = api.getSceneElementsIncludingDeleted();
  const cur = scene.find((e) => e.id === id);
  if (!cur) return;
  const placed = { ...next, x: cur.x, y: cur.y, groupIds: cur.groupIds, frameId: cur.frameId } as ExcalidrawElement;
  api.updateScene({
    elements: [...scene.map((e) => (e.id === id ? newElementWith(e, { isDeleted: true }) : e)), placed],
    appState: { selectedElementIds: { [placed.id]: true } } as never,
    captureUpdate: "IMMEDIATELY",
  });
}

const patchData = (api: API, id: string, patch: Record<string, unknown>, extra: Partial<ExcalidrawElement> = {}) =>
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((e) => (e.id === id ? newElementWith(e, { ...extra, customData: { ...e.customData, ...patch } } as never) : e)),
    captureUpdate: "IMMEDIATELY",
  });

async function fetchMeta(url: string) {
  return fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

const linkCardHeight = (meta?: { image?: string }) => (meta?.image ? Math.round(360 / 1.91) + 124 : 124);

/** Inserts a link card for `url` (preview fetched first). */
export async function makeLinkCard(url: string) {
  const meta = await fetchMeta(url);
  return createNode("link", 360, linkCardHeight(meta), { url, meta });
}

// ---------------- code block ----------------

const CODE_SIZES = [
  { value: 12, label: "小" },
  { value: 14, label: "中" },
  { value: 18, label: "大" },
  { value: 22, label: "特大" },
];

export function CodeBlockControls({ el }: { el: ExcalidrawElement }) {
  const { api } = useEditor();
  const data = el.customData as { code?: string; language?: string; fontSize?: number };
  const size = data.fontSize ?? 14;
  const language = data.language ?? "auto";
  const ready = useHighlighter();
  const detected = useMemo(() => (language === "auto" ? highlightCode(data.code ?? "", "auto").language : undefined), [language, data.code, ready]);
  const toText = () => {
    const [t] = convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: data.code || " ", fontSize: size, fontFamily: 3, strokeColor: "#242424" } as never]);
    replaceWith(api, el.id, { ...(t as ExcalidrawElement), x: el.x + 14, y: el.y + 14 } as ExcalidrawElement);
  };
  const setSize = (fontSize: number) => {
    const natural = codeBlockSize(data.code ?? "", size);
    const width = el.width >= natural.width - 1 ? Math.max(el.width, codeBlockSize(data.code ?? "", fontSize).width) : el.width;
    patchData(api, el.id, { fontSize }, codeBlockSize(data.code ?? "", fontSize, width));
  };
  return (
    <>
      <ModeSwitch
        value="code"
        options={[
          { value: "text", label: "文本" },
          { value: "code", label: "代码" },
        ]}
        onChange={toText}
      />
      <Menu
        side="top"
        sideOffset={8}
        trigger={
          <button type="button" className="ms-1 flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-accent">
            {CODE_SIZES.find((s) => s.value === size)?.label ?? size}
            <Caret />
          </button>
        }
      >
        {CODE_SIZES.map((s) => (
          <MenuItem key={s.value} onClick={() => setSize(s.value)}>
            {s.label}
            <span className="ms-auto text-xs text-muted-foreground tabular-nums">{s.value}</span>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        side="top"
        sideOffset={8}
        className="max-h-72 overflow-y-auto"
        trigger={
          <button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-accent">
            {language === "auto" && detected ? `自动检测 · ${languageLabel(detected)}` : languageLabel(language)}
            <Caret />
          </button>
        }
      >
        {CODE_BLOCK_LANGUAGES.map((l) => (
          <MenuItem key={l.value} onClick={() => patchData(api, el.id, { language: l.value })}>
            {l.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// ---------------- link card / web embed ----------------

function UrlInput({ value, label, width, onCommit }: { value: string; label: string; width: string; onCommit: (url: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      aria-label={label}
      className={cn("ms-1 h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring", width)}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const u = normalizeUrl(text);
        if (!u) {
          toast.error("请输入有效的网址");
          return setText(value);
        }
        if (u !== value) onCommit(u);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setText(value);
      }}
    />
  );
}

export function LinkCardControls({ el }: { el: ExcalidrawElement }) {
  const { api } = useEditor();
  const url = String((el.customData as { url?: string })?.url ?? "");
  const [loading, setLoading] = useState(false);
  const refetch = async (u: string) => {
    setLoading(true);
    const meta = await fetchMeta(u);
    setLoading(false);
    patchData(api, el.id, { url: u, meta }, { height: linkCardHeight(meta) });
  };
  return (
    <>
      <ModeSwitch
        value="card"
        options={[
          { value: "iframe", label: "网页" },
          { value: "card", label: "卡片" },
        ]}
        onChange={() => replaceWith(api, el.id, createEmbeddable(url, 720, 450))}
      />
      <UrlInput value={url} label="链接地址" width="w-56" onCommit={refetch} />
      <IconButton label="重新获取卡片信息" disabled={loading} onClick={() => refetch(url)}>
        <RefreshCw className={cn(loading && "animate-spin")} />
      </IconButton>
      <IconButton label="在新标签页打开" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
        <ExternalLink />
      </IconButton>
    </>
  );
}

export function WebEmbedControls({ el }: { el: ExcalidrawElement }) {
  const { api } = useEditor();
  const url = el.link ?? "";
  return (
    <>
      <ModeSwitch
        value="iframe"
        options={[
          { value: "iframe", label: "网页" },
          { value: "card", label: "卡片" },
        ]}
        onChange={() => makeLinkCard(url).then((card) => replaceWith(api, el.id, card))}
      />
      <UrlInput
        value={url}
        label="网页地址"
        width="w-64"
        onCommit={(u) => api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((e) => (e.id === el.id ? newElementWith(e, { link: u }) : e)), captureUpdate: "IMMEDIATELY" })}
      />
      <IconButton label="在新标签页打开" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
        <ExternalLink />
      </IconButton>
    </>
  );
}

// ---------------- code display (sandbox) ----------------

const DEVICE_SIZES = [
  { label: "手机", icon: <Smartphone />, width: 390, height: 844 },
  { label: "平板", icon: <Tablet />, width: 820, height: 1180 },
  { label: "电脑", icon: <Monitor />, width: 1440, height: 900 },
];
const SCALES = [1, 0.75, 0.5, 0.25];
const MIN_SIZE = 40;

type SandboxData = { stack: string; code: string; lockRatio?: boolean; lockSize?: boolean };

function resizeNode(api: API, id: string, width: number, height: number, patch?: Record<string, unknown>) {
  const w = Math.max(MIN_SIZE, Math.round(width));
  const h = Math.max(MIN_SIZE, Math.round(height));
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((e) => (e.id === id ? newElementWith(e, { width: w, height: h, customData: { ...e.customData, ...patch, ratio: w / h, lockedSize: [w, h] } } as never) : e)),
    captureUpdate: "IMMEDIATELY",
  });
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", checked ? "bg-neutral-800" : "bg-input")} onClick={() => onChange(!checked)}>
      <span className={cn("absolute top-0.5 size-3 rounded-full bg-white shadow transition-[left]", checked ? "left-3.5" : "left-0.5")} />
    </button>
  );
}

function SizeField({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        aria-label={label}
        disabled={disabled}
        inputMode="numeric"
        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs tabular-nums outline-none focus:border-ring disabled:opacity-50"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (n >= MIN_SIZE && n !== value) onCommit(n);
          else setText(String(value));
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** Size popover: device presets at 100–25 %, rotate, exact size, lock ratio / lock size. */
function SizePanel({ el }: { el: ExcalidrawElement }) {
  const { api } = useEditor();
  const data = el.customData as SandboxData;
  const lockRatio = !!data.lockRatio;
  const lockSize = !!data.lockSize;
  const W = Math.round(el.width);
  const H = Math.round(el.height);
  const [scale, setScale] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const dims = (d: (typeof DEVICE_SIZES)[number], s = scale, f = flipped) => {
    const w = Math.round(d.width * s);
    const h = Math.round(d.height * s);
    return f ? { width: h, height: w } : { width: w, height: h };
  };
  const current = DEVICE_SIZES.find((d) => {
    const x = dims(d);
    return x.width === W && x.height === H;
  });
  const onOpen = (open: boolean) => {
    if (!open) return;
    // infer scale / orientation from the current size
    for (const s of SCALES)
      for (const f of [false, true])
        if (DEVICE_SIZES.some((d) => dims(d, s, f).width === W && dims(d, s, f).height === H)) {
          setScale(s);
          setFlipped(f);
          return;
        }
    setScale(1);
    setFlipped(false);
  };
  const setDim = (which: "width" | "height", v: number) =>
    which === "width" ? resizeNode(api, el.id, v, lockRatio ? (v * el.height) / el.width : el.height) : resizeNode(api, el.id, lockRatio ? (v * el.width) / el.height : el.width, v);
  const option = (active: boolean) => cn("flex h-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-50", active ? "bg-[var(--highlight)] text-[var(--highlight-foreground)]" : "bg-muted/60 hover:bg-accent");
  return (
    <BPopover.Root onOpenChange={onOpen}>
      <BPopover.Trigger
        render={
          <button type="button" title="尺寸" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] tabular-nums hover:bg-accent data-[popup-open]:bg-accent">
            {lockSize ? <Lock className="size-3.5 text-muted-foreground" /> : lockRatio && <Link2 className="size-3.5 text-muted-foreground" />}
            {W} × {H}
            <Caret />
          </button>
        }
      />
      <BPopover.Portal>
        <BPopover.Positioner side="top" sideOffset={8} className="z-50">
          <BPopover.Popup className="rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg/5 outline-none">
            <div className="flex w-64 flex-col gap-1">
              <div className="flex items-center gap-1 pl-2">
                <span className="flex-1 text-xs text-muted-foreground">常用尺寸</span>
                <button
                  type="button"
                  title="横竖切换"
                  disabled={lockSize}
                  aria-pressed={flipped}
                  className={cn("flex h-7 items-center gap-1 rounded-md px-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50", flipped ? "bg-[var(--highlight)] text-[var(--highlight-foreground)]" : "hover:bg-accent")}
                  onClick={() => {
                    setFlipped((f) => !f);
                    resizeNode(api, el.id, el.height, el.width);
                  }}
                >
                  <RotateCwSquare className="size-3.5" />
                  旋转
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1 px-1">
                {SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={lockSize}
                    className={option(scale === s)}
                    onClick={() => {
                      setScale(s);
                      if (current) resizeNode(api, el.id, dims(current, s).width, dims(current, s).height, { lockRatio: true });
                    }}
                  >
                    {s * 100}%
                  </button>
                ))}
              </div>
              {DEVICE_SIZES.map((d) => {
                const x = dims(d);
                return (
                  <button
                    key={d.label}
                    type="button"
                    disabled={lockSize}
                    className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4", d === current ? "bg-[var(--highlight)] text-[var(--highlight-foreground)]" : "hover:bg-accent")}
                    onClick={() => resizeNode(api, el.id, x.width, x.height, { lockRatio: true })}
                  >
                    {d.icon}
                    <span className="flex-1 text-left">{d.label}</span>
                    <span className="text-xs tabular-nums opacity-60">
                      {x.width} × {x.height}
                    </span>
                  </button>
                );
              })}
              <div className="my-1 h-px bg-border" />
              <div className="flex items-end gap-2 px-2 pb-1">
                <SizeField label="宽" value={W} disabled={lockSize} onCommit={(v) => setDim("width", v)} />
                <SizeField label="高" value={H} disabled={lockSize} onCommit={(v) => setDim("height", v)} />
              </div>
              {(
                [
                  ["lockRatio", lockRatio, "锁定比例", "只能等比缩放"],
                  ["lockSize", lockSize, "禁止缩放", "不能拖动改变大小"],
                ] as const
              ).map(([key, on, title, hint]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px]">{title}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                  <Toggle checked={on} onChange={(v) => patchData(api, el.id, { [key]: v, ...(key === "lockSize" && v ? { lockedSize: [el.width, el.height] } : {}), ...(key === "lockRatio" && v ? { ratio: el.width / el.height } : {}) })} />
                </label>
              ))}
            </div>
          </BPopover.Popup>
        </BPopover.Positioner>
      </BPopover.Portal>
    </BPopover.Root>
  );
}

export function SandboxControls({ el }: { el: ExcalidrawElement }) {
  const { api, setPanel } = useEditor();
  const trpc = useTRPC();
  const { data: env } = useQuery(trpc.codeStack.list.queryOptions());
  const data = el.customData as SandboxData;
  const stack = env?.stacks.find((s) => s.key === data.stack);
  const siblings = stack ? env!.stacks.filter((s) => s.enabled && s.runtime === stack.runtime) : [];
  const openWindow = () => {
    if (!stack) return;
    const doc = buildSrcDoc(stack as never, data.code, (env?.fonts ?? []) as never);
    // The wrapper holds no user code; the code runs in a sandboxed iframe inside it.
    const wrapper = `<!doctype html><meta charset="utf-8"><title>代码展示</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts"></iframe><script>document.querySelector("iframe").srcdoc=${JSON.stringify(doc).replace(/</g, "\\u003c")}</script>`;
    window.open(URL.createObjectURL(new Blob([wrapper], { type: "text/html" })), "_blank", "noopener");
  };
  return (
    <>
      {stack ? (
        <Menu
          side="top"
          sideOffset={8}
          trigger={
            <button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-accent">
              {stack.name}
              <Caret />
            </button>
          }
        >
          {siblings.map((s) => (
            <MenuItem key={s.key} onClick={() => s.key !== data.stack && patchData(api, el.id, { stack: s.key })}>
              {s.name}
            </MenuItem>
          ))}
        </Menu>
      ) : (
        <span className="px-2 text-[13px] text-muted-foreground">{data.stack}（不可用）</span>
      )}
      <SizePanel el={el} />
      <button type="button" className={barBtn} onClick={() => setPanel({ kind: "sandbox", id: el.id })}>
        <CodeXml />
        编辑代码
      </button>
      {stack && (
        <button type="button" className={barBtn} onClick={openWindow}>
          <ExternalLink />
          新窗口打开
        </button>
      )}
    </>
  );
}

/** Keeps "禁止缩放" / "锁定比例" code-display nodes in shape after a resize (run when the user is idle). */
export function constrainSandboxes(api: API) {
  const fixes: Record<string, { width: number; height: number }> = {};
  for (const e of api.getSceneElements()) {
    const d = e.customData as (SandboxData & { lockedSize?: [number, number]; ratio?: number }) | undefined;
    if (e.type !== "embeddable" || d?.stack === undefined) continue;
    if (d.lockSize && d.lockedSize && (Math.abs(e.width - d.lockedSize[0]) > 0.5 || Math.abs(e.height - d.lockedSize[1]) > 0.5)) fixes[e.id] = { width: d.lockedSize[0], height: d.lockedSize[1] };
    else if (d.lockRatio && d.ratio && Math.abs(e.width / e.height - d.ratio) > 0.01) fixes[e.id] = { width: e.width, height: Math.round(e.width / d.ratio) };
  }
  if (!Object.keys(fixes).length) return;
  api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((e) => (fixes[e.id] ? newElementWith(e, fixes[e.id]) : e)), captureUpdate: "NEVER" });
}
