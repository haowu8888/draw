import { convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, Input, SegmentTabs, Select, Spinner, Textarea } from "@/components/ui";
import { useEditor, type DialogState } from "./editor-context";
import { ExportDialog } from "./export-dialog";
import { makeLinkCard } from "./node-bars";
import { createEmbeddable, createNode, insertElements, randomId, updateElements } from "./scene";

export function EditorDialogs({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  if (!dialog) return null;
  switch (dialog.kind) {
    case "mermaid":
      return <MermaidDialog elementIds={dialog.elementIds} initial={dialog.code} onClose={onClose} />;
    case "web":
      return <WebDialog onClose={onClose} initialMode={dialog.mode} />;
    case "video":
      return <VideoDialog onClose={onClose} />;
    case "export":
      return <ExportDialog scope={dialog.scope} onClose={onClose} />;
  }
}

/** Textarea tuned for code: monospace, Tab inserts two spaces. */
function CodeArea({ value, onChange, className, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; autoFocus?: boolean }) {
  return (
    <textarea
      autoFocus={autoFocus}
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        const t = e.currentTarget;
        const { selectionStart: s, selectionEnd: end } = t;
        const next = value.slice(0, s) + "  " + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = s + 2));
      }}
      className={`w-full resize-none rounded-lg border border-input bg-[#fafafa] p-3 font-mono text-[13px] leading-5 outline-none focus:border-ring ${className ?? ""}`}
    />
  );
}

// ---------------- Mermaid ----------------

const MERMAID_TEMPLATES: { label: string; code: string }[] = [
  { label: "流程图", code: "flowchart TD\n  A[收到问题] --> B{能否复现?}\n  B -->|是| C[定位原因]\n  B -->|否| G[补充信息]\n  C --> F[修复并提测]\n  G --> B" },
  { label: "时序图", code: "sequenceDiagram\n  participant 用户\n  participant 前端\n  participant 服务端\n  用户->>前端: 点击登录\n  前端->>服务端: POST /login\n  服务端-->>前端: 返回 token\n  前端-->>用户: 跳转首页" },
  { label: "类图", code: "classDiagram\n  class 用户 {\n    +String 名称\n    +登录()\n  }\n  class 订单 {\n    +Number 金额\n  }\n  用户 \"1\" --> \"*\" 订单" },
  { label: "状态图", code: "stateDiagram-v2\n  [*] --> 待处理\n  待处理 --> 处理中: 领取\n  处理中 --> 已完成: 完成\n  处理中 --> 待处理: 退回\n  已完成 --> [*]" },
  { label: "ER 图", code: "erDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains" },
  { label: "甘特图", code: "gantt\n  title 版本里程碑\n  dateFormat YYYY-MM-DD\n  section 开发\n  前端开发 :2026-10-10, 10d\n  后端开发 :2026-10-10, 12d\n  section 测试\n  交互设计 :after a1, 5d" },
  { label: "饼图", code: 'pie title 流量来源\n  "搜索" : 42\n  "直接访问" : 26\n  "社交媒体" : 18' },
  { label: "思维导图", code: "mindmap\n  root((产品))\n    用户\n      注册\n      登录\n    画布\n      形状\n      评论" },
  { label: "用户旅程", code: "journey\n  title 新用户上手\n  section 注册\n    打开官网: 5: 用户\n    填写信息: 3: 用户\n  section 使用\n    新建画布: 4: 用户" },
];

async function mermaidToElements(code: string) {
  const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
  const { elements, files } = await parseMermaidToExcalidraw(code, { themeVariables: { fontSize: "16px" } } as never);
  const els = convertToExcalidrawElements(elements as never, { regenerateIds: true });
  return { elements: els, files: (files ?? {}) as BinaryFiles };
}

function MermaidDialog({ elementIds, initial, onClose }: { elementIds?: string[]; initial?: string; onClose: () => void }) {
  const { api } = useEditor();
  const [code, setCode] = useState(initial ?? MERMAID_TEMPLATES[0].code);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const result = useRef<{ elements: ExcalidrawElement[]; files: BinaryFiles } | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await mermaidToElements(code);
        if (!alive) return;
        result.current = r;
        const s = await exportToSvg({ elements: r.elements, files: r.files, appState: { exportBackground: false }, exportPadding: 10 });
        if (alive) {
          setSvg(s.outerHTML);
          setError(null);
        }
      } catch (e) {
        if (alive) {
          result.current = null;
          setError((e as Error).message || "图表生成失败");
        }
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code]);

  const insert = async () => {
    setBusy(true);
    try {
      const r = result.current ?? (await mermaidToElements(code));
      const group = randomId();
      const tagged = r.elements.map((e) => ({ ...e, groupIds: [...e.groupIds, group], customData: { ...(e.customData ?? {}), mermaid: code } })) as ExcalidrawElement[];
      if (Object.keys(r.files).length) api.addFiles(Object.values(r.files) as BinaryFileData[]);
      let at: { x: number; y: number } | undefined;
      if (elementIds?.length) {
        const old = api.getSceneElements().filter((e) => elementIds.includes(e.id));
        if (old.length) {
          const minX = Math.min(...old.map((e) => e.x));
          const minY = Math.min(...old.map((e) => e.y));
          const w = Math.max(...tagged.map((e) => e.x + e.width)) - Math.min(...tagged.map((e) => e.x));
          const h = Math.max(...tagged.map((e) => e.y + e.height)) - Math.min(...tagged.map((e) => e.y));
          at = { x: minX + w / 2, y: minY + h / 2 };
        }
        updateElements(api, Object.fromEntries(elementIds.map((id) => [id, { isDeleted: true }])));
      }
      insertElements(api, tagged, at);
      onClose();
    } catch (e) {
      toast.error(`插入失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="图表代码（Mermaid）"
      description="流程图、时序图、甘特图等，生成后可继续编辑形状"
      className="max-w-5xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button loading={busy} disabled={!!error} onClick={insert}>
            {elementIds?.length ? "更新图表" : "插入"}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {MERMAID_TEMPLATES.map((t) => (
          <Button key={t.label} size="xs" variant="outline" onClick={() => setCode(t.code)}>
            {t.label}
          </Button>
        ))}
      </div>
      <div className="grid h-[52vh] grid-cols-2 gap-3">
        <CodeArea autoFocus value={code} onChange={setCode} className="h-full" />
        <div className="flex h-full items-center justify-center overflow-auto rounded-lg border bg-white p-3">
          {error ? (
            <pre className="text-xs whitespace-pre-wrap text-destructive-foreground">{error}</pre>
          ) : svg ? (
            <div className="max-h-full max-w-full [&_svg]:h-auto [&_svg]:max-h-[48vh] [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <Spinner />
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------- Web embed ----------------

function WebDialog({ onClose, initialMode }: { onClose: () => void; initialMode?: "card" | "embed" }) {
  const { api } = useEditor();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"card" | "embed">(initialMode ?? "embed");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    } catch {
      return toast.error(`无效的网址「${url}」`);
    }
    if (mode === "embed") {
      insertElements(api, [createEmbeddable(u.toString(), 640, 400)]);
      return onClose();
    }
    setBusy(true);
    const card = await makeLinkCard(u.toString());
    setBusy(false);
    insertElements(api, [card]);
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="网页嵌入"
      description="卡片显示标题、描述与预览图；嵌入网页可在画布内操作，部分网站禁止被嵌入（X-Frame-Options）会显示为空白。选中后可在两者之间切换。"
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button loading={busy} disabled={!url.trim()} onClick={submit}>
            插入
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <SegmentTabs
          value={mode}
          onValueChange={setMode}
          items={[
            { value: "embed", label: "嵌入网页" },
            { value: "card", label: "卡片" },
          ]}
        />
      </div>
    </Dialog>
  );
}

// ---------------- Video ----------------

function VideoDialog({ onClose }: { onClose: () => void }) {
  const { api, boardId, token } = useEditor();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const insert = (src: string) => {
    insertElements(api, [createNode("video", 560, 315, { src })]);
    onClose();
  };
  const upload = async (file: File) => {
    if (!file.type.startsWith("video/")) return toast.error(`不支持的文件类型：${file.type || file.name}`);
    if (file.size > 20 * 1024 * 1024) return toast.error("文件超过大小限制（20MB）");
    setBusy(true);
    try {
      const dataURL = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const id = `video-${randomId()}`;
      const q = token ? `?token=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/boards/${boardId}/files${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ id, mimeType: file.type, dataURL }]) });
      if (!res.ok) throw new Error(String(res.status));
      insert(`/api/boards/${boardId}/files/${id}/raw${q}`);
    } catch (e) {
      toast.error(`上传失败（${(e as Error).message}）`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="插入视频" className="max-w-lg">
      <div className="flex flex-col gap-3 pb-1">
        <div className="flex gap-2">
          <Input autoFocus placeholder="视频地址（mp4 / webm）" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button disabled={!/^https?:\/\//.test(url)} onClick={() => insert(url)}>
            插入
          </Button>
        </div>
        <div className="text-center text-xs text-muted-foreground">或</div>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-6 text-sm text-muted-foreground hover:bg-accent">
          {busy ? <Spinner /> : "选择本地视频上传（≤ 20MB）"}
          <input type="file" accept="video/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
    </Dialog>
  );
}
