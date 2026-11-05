import { useQuery } from "@tanstack/react-query";
import { Check, CodeXml, Copy, NotebookText, Scan, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, Textarea } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { CodeEditor, type CodeLanguage } from "./code-editor";
import { useEditor } from "./editor-context";
import { cancelNodePreview, updateNodeData } from "./ops";
import { buildPrompt, type Stack } from "./sandbox";
import { nodeKind } from "./scene";
import { ResizeHandle, usePanelWidth } from "./side-panel";

const RUNTIME_LANGUAGE: Record<string, CodeLanguage> = { html: "html", react: "jsx", vue: "vue" };

/**
 * Shared lifecycle of a node side panel: edits preview live without history, closing commits once
 * (or rolls back when nothing changed), and selecting another node of the same kind switches to it.
 */
function useNodeEditing(id: string, kind: "markdown" | "code", field: string, onClose: () => void, onSwitch: (id: string) => void) {
  const { api, ui } = useEditor();
  const initial = useRef(String((api.getSceneElements().find((e) => e.id === id)?.customData as Record<string, unknown> | undefined)?.[field] ?? ""));
  const latest = useRef(initial.current);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    if (latest.current === initial.current) cancelNodePreview(api, id);
    else updateNodeData(api, id, { [field]: latest.current }, "immediate");
  };
  const close = () => {
    finish();
    onClose();
  };
  useEffect(() => {
    done.current = false;
    return finish;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const exists = api.getSceneElements().some((e) => e.id === id);
  const sel = ui.selectedIds.length === 1 ? api.getSceneElements().find((e) => e.id === ui.selectedIds[0]) : undefined;
  const other = sel && nodeKind(sel as never) === kind && sel.id !== id ? sel.id : null;
  useEffect(() => {
    if (!exists) onClose();
    else if (other) {
      finish();
      onSwitch(other);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exists, other]);
  const change = (v: string) => {
    latest.current = v;
    updateNodeData(api, id, { [field]: v }, "preview");
  };
  return { initial: initial.current, latest, change, close };
}

function PanelShell({ width, setWidth, defaultWidth, children }: { width: number; setWidth: (w: number) => void; defaultWidth: number; children: React.ReactNode }) {
  return (
    <aside style={{ width }} className="pointer-events-auto absolute top-0 right-0 bottom-0 z-20 flex max-w-[90%] flex-col border-l border-white/10 bg-[#1e1f22] text-[#d4d4d4] shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
      <ResizeHandle width={width} defaultWidth={defaultWidth} onResize={setWidth} />
      {children}
    </aside>
  );
}

const CloseButton = ({ onClick, className }: { onClick: () => void; className?: string }) => (
  <button aria-label="关闭" className={`flex size-6 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white ${className ?? ""}`} onClick={onClick}>
    <X className="size-4" />
  </button>
);

export function MarkdownPanel({ id, onClose, onSwitch }: { id: string; onClose: () => void; onSwitch: (id: string) => void }) {
  const [width, setWidth, defaultWidth] = usePanelWidth("draw-markdown-panel-width", 420);
  const { initial, change, close } = useNodeEditing(id, "markdown", "source", onClose, onSwitch);
  return (
    <PanelShell width={width} setWidth={setWidth} defaultWidth={defaultWidth}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <NotebookText className="size-4 text-[#9cdcfe]" />
        <span className="text-sm font-medium text-white">Markdown</span>
        <CloseButton className="ms-auto" onClick={close} />
      </header>
      <CodeEditor className="flex-1" value={initial} language="markdown" autoFocus onChange={change} onEscape={close} />
      <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-white/10 px-4 text-xs text-white/40">
        <span>GFM · 提示框 :::tip · 公式 $…$ · Mermaid · Esc 关闭</span>
      </footer>
    </PanelShell>
  );
}

export function SandboxPanel({ id, onClose, onSwitch }: { id: string; onClose: () => void; onSwitch: (id: string) => void }) {
  const { api } = useEditor();
  const trpc = useTRPC();
  const { data: env } = useQuery(trpc.codeStack.list.queryOptions());
  const [width, setWidth, defaultWidth] = usePanelWidth("draw-sandbox-panel-width", 480);
  const { initial, latest, change, close } = useNodeEditing(id, "code", "code", onClose, onSwitch);
  const el = api.getSceneElements().find((e) => e.id === id);
  const stackKey = (el?.customData as { stack?: string } | undefined)?.stack;
  const stack = env?.stacks.find((s) => s.key === stackKey) as Stack | undefined;
  const [prompt, setPrompt] = useState<string | null>(null);
  return (
    <PanelShell width={width} setWidth={setWidth} defaultWidth={defaultWidth}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <CodeXml className="size-4 text-[#9cdcfe]" />
        <span className="truncate text-sm font-medium text-white">{stack?.name ?? stackKey ?? "代码"}</span>
        {stack && (
          <button className="ms-auto flex h-6 items-center gap-1 rounded-md px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setPrompt(latest.current)}>
            <Sparkles className="size-3.5" />
            提示词
          </button>
        )}
        <CloseButton className={stack ? "" : "ms-auto"} onClick={close} />
      </header>
      {stack && el && prompt !== null && <PromptDialog stack={stack} fonts={(env?.fonts ?? []) as never} size={{ width: el.width, height: el.height }} code={prompt} onClose={() => setPrompt(null)} />}
      {env ? <CodeEditor className="flex-1" value={initial} language={RUNTIME_LANGUAGE[stack?.runtime ?? "react"] ?? "jsx"} autoFocus onChange={change} onEscape={close} /> : <div className="flex-1" />}
    </PanelShell>
  );
}

const DEVICE_HINTS: [number, number, string][] = [
  [390, 844, "手机"],
  [768, 1024, "平板"],
  [1280, 800, "桌面"],
];
function sizeHint({ width, height }: { width: number; height: number }) {
  const w = Math.round(width);
  const h = Math.round(height);
  const m = DEVICE_HINTS.find(([a, b]) => (a === w && b === h) || (a === h && b === w));
  return m ? `${m[2]}${m[0] === w ? "" : "（横竖翻转）"}` : null;
}

/** Copyable AI prompt with the stack's constraints, the iframe size and the current code. */
function PromptDialog({ stack, fonts, size, code, onClose }: { stack: Stack; fonts: never; size: { width: number; height: number }; code: string; onClose: () => void }) {
  const [need, setNeed] = useState("");
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => buildPrompt(stack, fonts, { width: Math.round(size.width), height: Math.round(size.height) }, need, code), [stack, fonts, size.width, size.height, need, code]);
  const hint = sizeHint(size);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="AI 提示词"
      description={
        stack.prompt?.trim()
          ? `复制到任意 AI 对话中生成代码，再粘贴回代码面板。使用「${stack.name}」的自定义提示词，并附上 iframe 尺寸、可用字体、当前代码与需求。`
          : `复制到任意 AI 对话中生成代码，再粘贴回代码面板。提示词已包含「${stack.name}」的可用库、模块、沙箱限制、iframe 尺寸、可用字体与当前代码。`
      }
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "已复制" : "复制提示词"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Scan className="size-3.5" />
          当前 iframe 尺寸
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground tabular-nums">
            {Math.round(size.width)} × {Math.round(size.height)}
          </span>
          {hint && <span>{hint}</span>}
        </div>
        <Textarea autoFocus rows={3} placeholder="描述你的需求，如：一个带搜索和分页的用户列表（也可以复制后再补充）" value={need} onChange={(e) => setNeed(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{text}</pre>
      </div>
    </Dialog>
  );
}
