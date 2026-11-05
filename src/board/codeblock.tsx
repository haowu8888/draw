import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "./editor-context";
import { updateNodeData } from "./ops";
import { createNode, viewportCenter, insertElements, type API } from "./scene";

export const CODE_BLOCK_LANGUAGES = [
  { value: "auto", label: "自动检测" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "kotlin", label: "Kotlin" },
  { value: "swift", label: "Swift" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Shell" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "HTML / XML" },
  { value: "css", label: "CSS" },
  { value: "nginx", label: "Nginx" },
  { value: "markdown", label: "Markdown" },
  { value: "plaintext", label: "纯文本" },
];
const AUTO_SUBSET = CODE_BLOCK_LANGUAGES.map((l) => l.value).filter((v) => v !== "auto" && v !== "plaintext");
export const languageLabel = (v?: string) => CODE_BLOCK_LANGUAGES.find((l) => l.value === v)?.label ?? v ?? "";

export const CODE_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const LINE_HEIGHT = 1.5;
const PADDING = 14;
const MIN_WIDTH = 260;

type Hljs = typeof import("highlight.js").default;
let hljs: Hljs | null = null;
let loading: Promise<Hljs> | null = null;
function loadHljs() {
  return (loading ??= Promise.all([import("highlight.js/lib/common"), import("highlight.js/lib/languages/nginx")]).then(([c, nginx]) => {
    c.default.registerLanguage("nginx", nginx.default);
    hljs = c.default;
    return hljs;
  }));
}
const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Highlighted HTML plus the language used (detected when `language` is "auto"). */
export function highlightCode(code: string, language = "auto"): { html: string; language?: string } {
  if (!hljs || language === "plaintext") return { html: escapeHtml(code), language: language === "plaintext" ? language : undefined };
  try {
    if (language !== "auto" && hljs.getLanguage(language)) return { html: hljs.highlight(code, { language, ignoreIllegals: true }).value, language };
    const r = hljs.highlightAuto(code, AUTO_SUBSET);
    return { html: r.value, language: r.language };
  } catch {
    return { html: escapeHtml(code) };
  }
}

/** Re-renders once highlight.js has loaded. */
export function useHighlighter() {
  const [ready, setReady] = useState(!!hljs);
  useEffect(() => {
    if (!ready) loadHljs().then(() => setReady(true));
  }, [ready]);
  return ready;
}

let measureCtx: CanvasRenderingContext2D | null = null;
let measurePre: HTMLPreElement | null = null;

/** Box for `code`: grows to the longest line (min 260 wide) unless a narrower width is given, then wraps. */
export function codeBlockSize(code: string, fontSize: number, width?: number) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const lines = code.split("\n");
  let longest = 0;
  if (measureCtx) {
    measureCtx.font = `${fontSize}px ${CODE_FONT}`;
    for (const l of lines) longest = Math.max(longest, measureCtx.measureText(l.replaceAll("\t", "  ")).width);
  }
  const natural = Math.max(MIN_WIDTH, Math.ceil(longest) + PADDING * 2 + 2);
  if (width === undefined || width >= natural) return { width: width ?? natural, height: Math.ceil(lines.length * fontSize * LINE_HEIGHT) + PADDING * 2 };
  if (!measurePre) {
    measurePre = document.createElement("pre");
    Object.assign(measurePre.style, { position: "absolute", top: "0", left: "-99999px", visibility: "hidden", margin: "0", boxSizing: "border-box", whiteSpace: "pre-wrap", overflowWrap: "anywhere", tabSize: "2", fontFamily: CODE_FONT, lineHeight: String(LINE_HEIGHT), padding: `${PADDING}px` });
    document.body.append(measurePre);
  }
  measurePre.style.width = `${width}px`;
  measurePre.style.fontSize = `${fontSize}px`;
  measurePre.textContent = `${code}\n`;
  return { width, height: Math.ceil(measurePre.getBoundingClientRect().height) };
}

/** Size for new content keeping a user-narrowed width (wider-than-natural boxes follow the content). */
export function resizeFor(el: { width: number; customData?: Record<string, unknown> }, code: string, fontSize: number) {
  const prev = codeBlockSize(String(el.customData?.code ?? ""), Number(el.customData?.fontSize ?? 14));
  const width = el.width >= prev.width - 1 ? Math.max(el.width, codeBlockSize(code, fontSize).width) : el.width;
  return codeBlockSize(code, fontSize, width);
}

export function createCodeBlock(code = "", fontSize = 14, language = "auto") {
  const { width, height } = codeBlockSize(code, fontSize);
  return createNode("codeblock", width, height, { code, language, fontSize });
}

/** Adds an empty code block at the viewport center and returns its id. */
export function insertCodeBlock(api: API) {
  const el = createCodeBlock();
  const c = viewportCenter(api);
  const [placed] = insertElements(api, [el], { x: c.x, y: c.y }) ?? [];
  return placed?.id ?? null;
}

const textStyle = (fontSize: number) => ({ fontSize, lineHeight: LINE_HEIGHT, padding: PADDING, fontFamily: CODE_FONT, tabSize: 2 });

/** Static highlighted code (overlay content / export). */
export function CodeBlockView({ code, language, fontSize }: { code: string; language: string; fontSize: number }) {
  const ready = useHighlighter();
  const { html } = useMemo(() => highlightCode(code, language), [code, language, ready]);
  return (
    <div className="yx-code relative size-full overflow-hidden bg-[#f5f6f8]">
      <pre className="m-0 size-full overflow-hidden break-words whitespace-pre-wrap text-[#24292f] [overflow-wrap:anywhere]" style={textStyle(fontSize)} dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
      {!code && (
        <span data-no-export className="absolute top-0 left-0 text-neutral-400" style={textStyle(fontSize)}>
          双击输入代码
        </span>
      )}
    </div>
  );
}

/** In-place editor over a code block: transparent textarea on top of the live highlight. */
export function CodeBlockEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, ui } = useEditor();
  const el = api.getSceneElements().find((e) => e.id === id);
  const data = (el?.customData ?? {}) as { code?: string; language?: string; fontSize?: number };
  const [code, setCode] = useState(data.code ?? "");
  const dirty = useRef(false);
  const initial = useRef(el);
  const ready = useHighlighter();
  const fontSize = data.fontSize ?? 14;
  const { html } = useMemo(() => highlightCode(code, data.language ?? "auto"), [code, data.language, ready]);
  useEffect(() => {
    if (!el) onClose();
  }, [el, onClose]);
  if (!el) return null;
  const sizeFor = (v: string) => resizeFor(initial.current ?? el, v, fontSize);
  const change = (v: string) => {
    setCode(v);
    dirty.current = true;
    updateNodeData(api, id, { code: v }, "preview", sizeFor(v));
  };
  const finish = () => {
    if (dirty.current) updateNodeData(api, id, { code }, "immediate", sizeFor(code));
    dirty.current = false;
    onClose();
  };
  return (
    <div
      className="yx-code pointer-events-auto absolute z-[7] bg-[#f5f6f8]"
      style={{
        left: (el.x + ui.scrollX) * ui.zoom,
        top: (el.y + ui.scrollY) * ui.zoom,
        width: el.width,
        height: el.height,
        transform: `scale(${ui.zoom}) rotate(${el.angle}rad)`,
        transformOrigin: el.angle ? `${el.width / 2}px ${el.height / 2}px` : "0 0",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <pre aria-hidden className="m-0 size-full overflow-hidden break-words whitespace-pre-wrap text-[#24292f] [overflow-wrap:anywhere]" style={textStyle(fontSize)} dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
      <textarea
        autoFocus
        spellCheck={false}
        aria-label="代码"
        className="absolute inset-0 resize-none overflow-hidden bg-transparent break-words whitespace-pre-wrap text-transparent caret-[#24292f] outline-2 outline-[var(--yx-selection)] [overflow-wrap:anywhere] selection:bg-[#b3d4fc]"
        style={textStyle(fontSize)}
        value={code}
        onChange={(e) => change(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") e.currentTarget.blur();
          if (e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: s, selectionEnd: end } = t;
            change(`${code.slice(0, s)}  ${code.slice(end)}`);
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
      />
    </div>
  );
}
