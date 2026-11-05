import katex from "katex";
import "katex/dist/katex.min.css";
import { Marked, type Tokens } from "marked";
import { useEffect, useRef, useState } from "react";

let mermaidSeq = 0;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const TIP_LABEL: Record<string, string> = { tip: "提示", note: "注意", info: "信息", warning: "警告", danger: "危险" };

/** marked instance with: :::tip blocks, $math$ / $$math$$, ==highlight==, mermaid fences. */
const md = new Marked({ gfm: true, breaks: true });
md.use({
  extensions: [
    {
      name: "container",
      level: "block",
      start: (src) => src.match(/^:::/m)?.index,
      tokenizer(src) {
        const m = /^:::(\w+)[ \t]*([^\n]*)\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
        if (!m) return;
        return { type: "container", raw: m[0], kind: m[1], title: m[2], tokens: this.lexer.blockTokens(m[3], []) };
      },
      renderer(t) {
        const tok = t as Tokens.Generic;
        return `<div class="md-tip md-tip-${tok.kind}"><div class="md-tip-title">${escapeHtml(tok.title || TIP_LABEL[tok.kind] || tok.kind)}</div>${this.parser.parse(tok.tokens ?? [])}</div>`;
      },
    },
    {
      name: "blockMath",
      level: "block",
      start: (src) => src.indexOf("$$"),
      tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
        if (m) return { type: "blockMath", raw: m[0], text: m[1].trim() };
      },
      renderer: (t) => katex.renderToString((t as Tokens.Generic).text, { displayMode: true, throwOnError: false }),
    },
    {
      name: "inlineMath",
      level: "inline",
      start: (src) => src.indexOf("$"),
      tokenizer(src) {
        const m = /^\$([^$\n]+?)\$/.exec(src);
        if (m) return { type: "inlineMath", raw: m[0], text: m[1] };
      },
      renderer: (t) => katex.renderToString((t as Tokens.Generic).text, { throwOnError: false }),
    },
    {
      name: "mark",
      level: "inline",
      start: (src) => src.indexOf("=="),
      tokenizer(src) {
        const m = /^==([^=\n]+)==/.exec(src);
        if (m) return { type: "mark", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(t) {
        return `<mark>${this.parser.parseInline((t as Tokens.Generic).tokens ?? [])}</mark>`;
      },
    },
  ],
  renderer: {
    // Markdown is shared between collaborators: never pass raw HTML or script URLs through.
    html: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const safe = /^(https?:|mailto:|#|\/)/i.test(href) ? href : "#";
      return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${escapeHtml(title)}"` : ""}>${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, text }) {
      const safe = /^(https?:|data:image\/|\/)/i.test(href) ? href : "";
      return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}">`;
    },
    code({ text, lang }) {
      if (lang === "mermaid") return `<div class="md-mermaid" data-id="m${++mermaidSeq}">${escapeHtml(text)}</div>`;
      return `<pre class="md-code"><code class="language-${escapeHtml(lang ?? "")}">${escapeHtml(text)}</code></pre>`;
    },
  },
});

export const renderMarkdown = (src: string) => md.parse(src) as string;

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(() => renderMarkdown(source));
  useEffect(() => setHtml(renderMarkdown(source)), [source]);
  useEffect(() => {
    const blocks = ref.current?.querySelectorAll<HTMLDivElement>(".md-mermaid");
    if (!blocks?.length) return;
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
      for (const b of blocks) {
        try {
          const { svg } = await mermaid.render(`mmd-${b.dataset.id}-${Date.now()}`, b.textContent ?? "");
          if (!cancelled) b.innerHTML = svg;
        } catch (e) {
          if (!cancelled) b.innerHTML = `<pre class="md-code" style="color:#b91c1c">${escapeHtml((e as Error).message)}</pre>`;
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [html]);
  return <div ref={ref} className={`md-body ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
