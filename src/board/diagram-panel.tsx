import { ArrowDown, ArrowRight, Braces, Loader2, Workflow, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";
import { cancelDiagramPreview, diagramCode, diagramLabel, diagramOf, flowDirection, highlightMermaid, renderDiagram, updateDiagram, withDirection } from "./diagram";
import { useEditor } from "./editor-context";
import { ResizeHandle, usePanelWidth } from "./side-panel";

const LINE = 20;

/** The diagram all selected elements belong to, if they share one. */
export function useSelectedDiagram() {
  const { api, ui } = useEditor();
  const sel = api.getSceneElements().filter((e) => ui.selectedIds.includes(e.id));
  const d = sel[0] && diagramOf(sel[0]);
  return d && sel.every((e) => diagramOf(e)?.id === d.id) ? { data: d, elements: sel } : null;
}

/** Tag above a selected diagram: its type plus a toggle for the code panel. */
export function DiagramBadge() {
  const { ui, panel, setPanel } = useEditor();
  const sel = useSelectedDiagram();
  if (!sel || ui.busy) return null;
  const left = (Math.min(...sel.elements.map((e) => e.x)) + ui.scrollX) * ui.zoom;
  const top = (Math.min(...sel.elements.map((e) => e.y)) + ui.scrollY) * ui.zoom;
  const open = panel?.kind === "diagram" && panel.id === sel.data.id;
  return (
    <div className="pointer-events-auto absolute z-[4] flex -translate-y-full gap-1 pb-2" style={{ left, top: top - 4 }}>
      <span className="flex h-6 items-center gap-1 rounded-[4px] border border-[var(--yx-selection)] bg-background px-1.5 text-[12px]">
        <Workflow className="size-3" />
        {diagramLabel(sel.data.code)}
      </span>
      <button
        type="button"
        aria-pressed={open}
        className={cn("flex h-6 items-center gap-1 rounded-[4px] border bg-background px-1.5 text-[12px] hover:bg-accent", open && "bg-accent")}
        onClick={() => setPanel(open ? null : { kind: "diagram", id: sel.data.id })}
      >
        <Braces className="size-3" />
        代码编辑器
      </button>
    </div>
  );
}

/** Properties-bar controls for a selected diagram. */
export function DiagramControls({ id, code }: { id: string; code: string }) {
  const { api, panel, setPanel } = useEditor();
  const dir = flowDirection(code);
  const open = panel?.kind === "diagram" && panel.id === id;
  const setDir = (d: "LR" | "TD") => {
    if (d !== dir) updateDiagram(api, id, withDirection(code, d)).catch(() => toast.error("图表更新失败"));
  };
  return (
    <>
      <span className="flex h-8 items-center gap-1.5 px-2 text-[13px]">
        <Workflow className="size-3.5 text-muted-foreground" />
        {diagramLabel(code)}
      </span>
      <button
        type="button"
        aria-pressed={open}
        className={cn("flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[13px] hover:bg-foreground/8", open && "bg-foreground/10")}
        onClick={() => setPanel(open ? null : { kind: "diagram", id })}
      >
        <Braces className="size-3.5" />
        编辑代码
      </button>
      {dir && (
        <>
          <Tooltip content="横向布局" side="top">
            <button type="button" aria-label="横向布局" aria-pressed={dir === "LR"} className="bar-toggle ms-1" onClick={() => setDir("LR")}>
              <ArrowRight />
            </button>
          </Tooltip>
          <Tooltip content="纵向布局" side="top">
            <button type="button" aria-label="纵向布局" aria-pressed={dir === "TD"} className="bar-toggle" onClick={() => setDir("TD")}>
              <ArrowDown />
            </button>
          </Tooltip>
        </>
      )}
    </>
  );
}

/** Dark side panel with a highlighted Mermaid editor; the canvas re-renders after a short pause. */
export function DiagramPanel({ id, onClose, onSwitch }: { id: string; onClose: () => void; onSwitch: (id: string) => void }) {
  const { api, ui } = useEditor();
  const [width, setWidth, defaultWidth] = usePanelWidth("draw-diagram-panel-width", 400);
  const initial = useRef(diagramCode(api, id) ?? "");
  const [code, setCode] = useState(initial.current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const applied = useRef(initial.current);
  const gutter = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const run = useRef(0);
  const pending = useRef<Promise<void> | null>(null);

  // live preview after a pause
  useEffect(() => {
    if (code === applied.current) return;
    const seq = ++run.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        if (seq !== run.current) return;
        pending.current = updateDiagram(api, id, code, "preview");
        await pending.current;
        if (seq !== run.current) return;
        applied.current = code;
        setError(null);
      } catch (e) {
        if (seq === run.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === run.current) setBusy(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [api, id, code]);

  // commit the last good preview as one undo step (once)
  const commit = useRef<Promise<void> | null>(null);
  const finish = () =>
    (commit.current ??= (async () => {
      run.current++;
      await pending.current?.catch(() => {});
      if (applied.current !== initial.current) {
        try {
          await updateDiagram(api, id, applied.current, "immediate");
        } catch {
          cancelDiagramPreview(api, id);
        }
      } else cancelDiagramPreview(api, id);
    })());
  const close = async () => {
    await finish();
    onClose();
  };
  useEffect(() => {
    commit.current = null;
    return () => void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selecting another diagram switches the panel to it
  const selected = api.getSceneElements().filter((e) => ui.selectedIds.includes(e.id));
  const selDiagram = selected[0] && diagramOf(selected[0]);
  const otherId = selDiagram && selected.every((e) => diagramOf(e)?.id === selDiagram.id) ? selDiagram.id : null;
  useEffect(() => {
    if (otherId && otherId !== id) finish().then(() => onSwitch(otherId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId, id]);

  // surface syntax errors of the initial code
  useEffect(() => {
    renderDiagram(initial.current).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const lines = code.split("\n").length;
  return (
    <aside
      style={{ width }}
      className="pointer-events-auto absolute top-0 right-0 bottom-0 z-20 flex max-w-[90%] flex-col border-l border-white/10 bg-[#1e1f22] text-[#d4d4d4] shadow-2xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ResizeHandle width={width} defaultWidth={defaultWidth} onResize={setWidth} />
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <Workflow className="size-4 text-[#9cdcfe]" />
        <span className="text-sm font-medium text-white">{diagramLabel(code)}</span>
        <span className="text-xs text-white/40">Mermaid 图表代码</span>
        {busy && <Loader2 className="size-3.5 animate-spin text-white/50" />}
        <button aria-label="关闭" className="ms-auto flex size-6 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white" onClick={close}>
          <X className="size-4" />
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1 font-mono text-[13px]">
        <div ref={gutter} aria-hidden className="w-10 shrink-0 overflow-hidden py-3 pe-2 text-right text-white/25 select-none" style={{ lineHeight: `${LINE}px` }}>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <pre
            ref={pre}
            aria-hidden
            className="mmd-code pointer-events-none absolute inset-0 m-0 overflow-hidden py-3 pe-3 whitespace-pre text-[#d4d4d4]"
            style={{ lineHeight: `${LINE}px`, tabSize: 2 }}
            dangerouslySetInnerHTML={{ __html: `${highlightMermaid(code)}\n` }}
          />
          <textarea
            autoFocus
            spellCheck={false}
            aria-label="Mermaid 代码"
            className="absolute inset-0 size-full resize-none bg-transparent py-3 pe-3 whitespace-pre text-transparent caret-white outline-none selection:bg-[#264f78]/70"
            style={{ lineHeight: `${LINE}px`, tabSize: 2 }}
            value={code}
            onScroll={(e) => {
              const { scrollTop, scrollLeft } = e.currentTarget;
              if (gutter.current) gutter.current.scrollTop = scrollTop;
              if (pre.current) {
                pre.current.scrollTop = scrollTop;
                pre.current.scrollLeft = scrollLeft;
              }
            }}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") close();
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget;
                const { selectionStart: s, selectionEnd: end } = t;
                setCode(`${code.slice(0, s)}  ${code.slice(end)}`);
                requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
              }
            }}
          />
        </div>
      </div>
      {error && <div className="max-h-32 shrink-0 overflow-auto border-t border-white/10 bg-[#3a1d1d] px-4 py-2 font-mono text-xs whitespace-pre-wrap text-[#f48771]">{error}</div>}
      <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-white/10 px-4 text-xs text-white/40">
        <span>停顿后自动更新 · Esc 关闭</span>
        <a className="ms-auto hover:text-white/80" href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noreferrer">
          语法参考 ↗
        </a>
      </footer>
    </aside>
  );
}
