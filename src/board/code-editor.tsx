import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type CodeLanguage = "markdown" | "html" | "jsx" | "vue";

async function languageFor(lang: CodeLanguage) {
  if (lang === "html") return (await import("@codemirror/lang-html")).html();
  if (lang === "vue") return (await import("@codemirror/lang-vue")).vue();
  if (lang === "markdown") {
    const [{ markdown, markdownLanguage }, { javascript }, { html }, { css }] = await Promise.all([
      import("@codemirror/lang-markdown"),
      import("@codemirror/lang-javascript"),
      import("@codemirror/lang-html"),
      import("@codemirror/lang-css"),
    ]);
    const js = javascript({ jsx: true, typescript: true }).language;
    const markup = html().language;
    const nested: Record<string, typeof js> = { js, javascript: js, jsx: js, ts: js, typescript: js, tsx: js, json: js, html: markup, xml: markup, vue: markup, svg: markup, css: css().language };
    return markdown({ base: markdownLanguage, codeLanguages: (info) => nested[info.trim().toLowerCase()] ?? null });
  }
  return (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true });
}

/** Dark CodeMirror editor for the side panels (uncontrolled: `value` is the initial document). */
export function CodeEditor({ value, onChange, language, onEscape, autoFocus, className }: { value: string; onChange: (v: string) => void; language: CodeLanguage; onEscape?: () => void; autoFocus?: boolean; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef(value);
  const handlers = useRef({ onChange, onEscape });
  handlers.current = { onChange, onEscape };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let view: import("@codemirror/view").EditorView | null = null;
    let cancelled = false;
    (async () => {
      const [{ basicSetup }, { EditorView, keymap }, { EditorState }, { indentWithTab }, { oneDark }, lang] = await Promise.all([
        import("codemirror"),
        import("@codemirror/view"),
        import("@codemirror/state"),
        import("@codemirror/commands"),
        import("@codemirror/theme-one-dark"),
        languageFor(language),
      ]);
      if (cancelled || !host.current) return;
      view = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: initial.current,
          extensions: [
            basicSetup,
            keymap.of([indentWithTab, { key: "Escape", run: () => (handlers.current.onEscape ? (handlers.current.onEscape(), true) : false) }]),
            lang,
            language === "markdown" ? EditorView.lineWrapping : [],
            oneDark,
            EditorState.tabSize.of(2),
            EditorView.theme({
              "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent" },
              ".cm-scroller": { fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "20px" },
              ".cm-gutters": { backgroundColor: "transparent", borderRight: "none" },
              ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
              ".cm-scroller::-webkit-scrollbar-track, .cm-scroller::-webkit-scrollbar-corner": { background: "transparent" },
              ".cm-scroller::-webkit-scrollbar-thumb": { backgroundColor: "rgb(255 255 255 / 0.2)", backgroundClip: "content-box", border: "2px solid transparent", borderRadius: "6px" },
              ".cm-scroller::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgb(255 255 255 / 0.4)" },
            }),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
            }),
          ],
        }),
      });
      setReady(true);
      if (autoFocus) view.focus();
    })();
    return () => {
      cancelled = true;
      view?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return (
    <div className={cn("relative min-h-0", className)}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/40">
          <Loader2 className="size-4 animate-spin" />
          加载编辑器…
        </div>
      )}
      <div ref={host} className="size-full" onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}
