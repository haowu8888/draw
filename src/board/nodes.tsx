import type { ExcalidrawElement, ExcalidrawEmbeddableElement, NonDeleted } from "@excalidraw/excalidraw/element/types";
import { ExternalLink, Globe, TriangleAlert } from "lucide-react";
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChartView, type ChartConfig } from "./chart";
import { CodeBlockView } from "./codeblock";
import { MarkdownView } from "./markdown";
import { buildSrcDoc, type FontInfo, type Stack } from "./sandbox";
import { nodeKind } from "./scene";

export interface NodeEnv {
  stacks: Stack[];
  fonts: FontInfo[];
  boardId: string;
  token: string | null;
  /** Resizes a node to its content height (editors only). */
  fit?: (id: string, height: number) => void;
}

export const NodeEnvContext = createContext<NodeEnv>({ stacks: [], fonts: [], boardId: "", token: null });

const MIN_MARKDOWN_HEIGHT = 60;

export interface CodeData {
  kind: "code";
  stack: string;
  code: string;
  scale?: number;
  showSize?: boolean;
}

/** Embeddable nodes (live iframes / video) rendered by Excalidraw itself. */
export function renderNode(el: NonDeleted<ExcalidrawEmbeddableElement>) {
  const kind = nodeKind(el);
  const data = (el.customData ?? {}) as Record<string, unknown>;
  if (kind === "code") return <CodeNode data={data as unknown as CodeData} width={el.width} height={el.height} />;
  if (kind === "video") return <video src={String(data.src ?? "")} controls className="size-full bg-black object-contain" />;
  // legacy embeddable versions of overlay kinds (normally migrated on load)
  if (kind) return <NodeContent id={el.id} kind={kind} data={data} />;
  return null;
}

/** Content of an overlay node (markdown / code block / chart / link card), sized to the element box. */
export const NodeContent = memo(function NodeContent({ id, kind, data }: { id: string; kind: string; data: Record<string, unknown> }) {
  switch (kind) {
    case "markdown":
      return <MarkdownNode id={id} source={String(data.source ?? "")} />;
    case "chart":
      return (
        <div className="size-full bg-white">
          <ChartView config={data.chart as ChartConfig} />
        </div>
      );
    case "codeblock":
      return <CodeBlockView code={String(data.code ?? "")} language={String(data.language ?? "auto")} fontSize={Number(data.fontSize ?? 14)} />;
    case "link":
      return <LinkCard url={String(data.url ?? "")} meta={data.meta as LinkMeta | undefined} />;
  }
  return null;
});

export const nodeData = (el: ExcalidrawElement) => (el.customData ?? {}) as Record<string, unknown>;

/** Reports the natural height of `ref` so the element can follow its content. */
function useFitHeight(id: string, ref: React.RefObject<HTMLDivElement | null>, min: number) {
  const env = useContext(NodeEnvContext);
  useEffect(() => {
    const el = ref.current;
    if (!el || !env.fit) return;
    const ro = new ResizeObserver(() => env.fit?.(id, Math.max(min, Math.ceil(el.offsetHeight))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, env.fit, ref, min]);
}

/** Markdown card; its element height follows the rendered content (like the original). */
const MarkdownNode = memo(function MarkdownNode({ id, source }: { id: string; source: string }) {
  const inner = useRef<HTMLDivElement>(null);
  useFitHeight(id, inner, MIN_MARKDOWN_HEIGHT);
  return (
    <div className="size-full overflow-hidden bg-white shadow-[inset_0_0_0_1px_#e4e4e7]">
      <div ref={inner} style={{ padding: 20 }}>
        {source.trim() ? <MarkdownView source={source} /> : <div className="text-sm text-neutral-400">双击编辑 Markdown</div>}
      </div>
    </div>
  );
});

const CodeNode = memo(function CodeNode({ data, width, height }: { data: CodeData; width: number; height: number }) {
  const env = useContext(NodeEnvContext);
  const stack = env.stacks.find((s) => s.key === data.stack);
  const srcDoc = useMemo(() => (stack && stack.enabled ? buildSrcDoc(stack, data.code, env.fonts) : null), [stack, data.code, env.fonts]);
  const scale = data.scale ?? 1;
  if (!stack || !stack.enabled) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 bg-neutral-50 p-4 text-center text-sm text-neutral-500">
        <TriangleAlert className="size-5 text-amber-500" />
        <div>方案不可用</div>
        <div className="text-xs">技术方案「{data.stack}」可能已被管理员停用或删除，代码仍保留</div>
      </div>
    );
  }
  return (
    <div className="relative size-full overflow-hidden bg-white">
      <iframe
        title="代码展示"
        sandbox="allow-scripts"
        srcDoc={srcDoc ?? ""}
        className="origin-top-left border-0"
        style={{ width: width / scale, height: height / scale, transform: `scale(${scale})` }}
      />
      {data.showSize && (
        <span className="pointer-events-none absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {Math.round(width)} × {Math.round(height)}
        </span>
      )}
    </div>
  );
});

export interface LinkMeta {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

function LinkCard({ url, meta }: { url: string; meta?: LinkMeta }) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex size-full overflow-hidden rounded-xl bg-white text-left no-underline shadow-[inset_0_0_0_1px_#e4e4e7]">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
        <div className="line-clamp-2 text-sm font-semibold text-neutral-900">{meta?.title || host}</div>
        {meta?.description && <div className="line-clamp-2 text-xs text-neutral-500">{meta.description}</div>}
        <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
          <Globe className="size-3" />
          <span className="truncate">{meta?.siteName || host}</span>
          <ExternalLink className="ml-auto size-3" />
        </div>
      </div>
      {meta?.image && <img src={meta.image} alt="" referrerPolicy="no-referrer" className="h-full w-2/5 shrink-0 object-cover" />}
    </a>
  );
}
