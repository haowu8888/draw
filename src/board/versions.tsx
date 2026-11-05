import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NameDialog } from "@/components/common";
import { AlertDialog, Badge, Button, Input, Menu, MenuItem, MenuSeparator, Sheet, Spinner, UnderlineTabs } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { errorMessage, formatTime } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { NodeOverlays } from "./node-overlays";
import { renderNode } from "./nodes";
import { migrateNode } from "./scene";

type Version = { id: string; name: string; auto: boolean; createdAt: string; userName: string | null; current: boolean };

export function VersionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { boardId, token, canEdit } = useEditor();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"named" | "all">("named");
  const [name, setName] = useState("");
  const { data, isPending } = useQuery({ ...trpc.boardVersion.list.queryOptions({ boardId, all: tab === "all", token }), enabled: open });
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.boardVersion.pathKey() });
  const err = (fallback: string) => (e: unknown) => toast.error(errorMessage(e, fallback));
  const create = useMutation(trpc.boardVersion.create.mutationOptions({ onSuccess: refresh, onError: err("保存版本失败") }));
  const rename = useMutation(trpc.boardVersion.rename.mutationOptions({ onSuccess: refresh, onError: err("重命名失败") }));
  const remove = useMutation(trpc.boardVersion.remove.mutationOptions({ onSuccess: refresh, onError: err("删除失败") }));
  const restore = useMutation(trpc.boardVersion.restore.mutationOptions({ onSuccess: refresh, onError: err("恢复失败") }));
  const [action, setAction] = useState<{ kind: "rename" | "delete" | "restore"; v: Version } | null>(null);
  const [preview, setPreview] = useState<Version | null>(null);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await create.mutateAsync({ boardId, name: n, token });
    setName("");
    toast.success(`已保存版本「${n}」`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="版本管理" description="保存当前画布为命名版本，可随时预览或恢复。当前版本不能删除。" className="max-w-sm">
        {canEdit && (
          <div className="flex gap-2">
            <Input value={name} placeholder="新版本名称，如：评审前 / v1.0" maxLength={64} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()} />
            <Button disabled={!name.trim()} loading={create.isPending} onClick={add}>
              新增版本
            </Button>
          </div>
        )}
        <UnderlineTabs
          className="mt-4"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "named", label: "命名版本" },
            { value: "all", label: "全部（含自动保存）" },
          ]}
        />
        <div className="mt-2 flex flex-col">
          {isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !data?.items.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">还没有版本，输入名称后点击「新增版本」</div>
          ) : (
            data.items.map((v) => (
              <div key={v.id} className="group flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="truncate font-medium">{v.name}</span>
                    {v.current && <Badge variant="success">当前</Badge>}
                    {v.auto && <Badge>自动保存</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatTime(v.createdAt)} {v.userName && `· ${v.userName}`}
                  </div>
                </div>
                <Button size="xs" variant="ghost" onClick={() => setPreview(v)}>
                  <Eye />
                  预览
                </Button>
                {canEdit && (
                  <Menu
                    align="end"
                    trigger={
                      <button className="tool-btn size-7" aria-label="更多操作">
                        <MoreHorizontal />
                      </button>
                    }
                  >
                    <MenuItem onClick={() => setAction({ kind: "restore", v })}>
                      <RotateCcw />
                      恢复到此版本
                    </MenuItem>
                    <MenuItem onClick={() => setAction({ kind: "rename", v })}>
                      <Pencil />
                      重命名
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive disabled={v.current} onClick={() => setAction({ kind: "delete", v })}>
                      <Trash2 />
                      {v.current ? "当前版本不能删除" : "删除"}
                    </MenuItem>
                  </Menu>
                )}
              </div>
            ))
          )}
        </div>
      </Sheet>
      <NameDialog
        open={action?.kind === "rename"}
        onOpenChange={(o) => !o && setAction(null)}
        title="重命名"
        initial={action?.v.name}
        onSubmit={(n) => rename.mutateAsync({ id: action!.v.id, name: n, token }).then(() => toast.success("已重命名"))}
      />
      <AlertDialog
        open={action?.kind === "delete"}
        onOpenChange={(o) => !o && setAction(null)}
        title="删除版本？"
        description={`「${action?.v.name}」删除后无法找回。`}
        destructive
        confirmText="删除"
        loading={remove.isPending}
        onConfirm={() => remove.mutateAsync({ id: action!.v.id, token }).then(() => (setAction(null), toast.success(`已删除「${action!.v.name}」`)))}
      />
      <AlertDialog
        open={action?.kind === "restore"}
        onOpenChange={(o) => !o && setAction(null)}
        title="恢复到此版本？"
        description="画布内容会替换为该版本，并设为当前版本；替换前会自动保存一份当前内容，可再恢复回来。在线协作者会同步看到。"
        confirmText="恢复"
        loading={restore.isPending}
        onConfirm={() =>
          restore.mutateAsync({ id: action!.v.id, token }).then((r) => {
            setAction(null);
            setPreview(null);
            onOpenChange(false);
            toast.success(`已恢复到「${r.name}」`);
          })
        }
      />
      {preview && <VersionPreview version={preview} onClose={() => setPreview(null)} onRestore={canEdit ? () => setAction({ kind: "restore", v: preview }) : undefined} />}
    </>
  );
}

function VersionPreview({ version, onClose, onRestore }: { version: Version; onClose: () => void; onRestore?: () => void }) {
  const { token } = useEditor();
  const trpc = useTRPC();
  const { data } = useQuery(trpc.boardVersion.get.queryOptions({ id: version.id, token }));
  const [pageIdx, setPageIdx] = useState(0);
  const [previewApi, setPreviewApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const initial = useMemo(() => {
    if (!data) return null;
    const page = data.pages[pageIdx];
    return {
      elements: restoreElements(((page?.elements ?? []) as never[]).map(migrateNode) as never, null),
      files: Object.fromEntries(data.files.map((f) => [f.id, { id: f.id, mimeType: f.mimeType, dataURL: f.dataURL, created: 0 } as BinaryFileData])),
      appState: { viewBackgroundColor: "#ffffff" },
      scrollToContent: true,
    };
  }, [data, pageIdx]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex h-11 items-center gap-2 border-b bg-[#fafafa] px-3 text-sm">
        <span className="font-medium">版本：{version.name}</span>
        <span className="text-muted-foreground">{formatTime(version.createdAt)}</span>
        {data && data.pages.length > 1 && (
          <div className="ml-3 flex gap-1">
            {data.pages.map((p, i) => (
              <Button key={p.id} size="xs" variant={i === pageIdx ? "secondary" : "ghost"} onClick={() => setPageIdx(i)}>
                {p.name}
              </Button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {onRestore && (
            <Button size="sm" onClick={onRestore}>
              <RotateCcw />
              恢复为此版本
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="关闭">
            <X />
          </Button>
        </div>
      </div>
      <div ref={setRoot} className="board-editor is-embed relative flex-1" style={{ position: "relative" }}>
        <NodeOverlays api={previewApi} root={root} />
        {initial ? <Excalidraw key={pageIdx} excalidrawAPI={setPreviewApi} initialData={initial} viewModeEnabled langCode="zh-CN" validateEmbeddable={() => true} renderEmbeddable={(el) => renderNode(el)} UIOptions={{ canvasActions: { export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, clearCanvas: false, changeViewBackgroundColor: false, saveAsImage: false } }} /> : <div className="flex h-full items-center justify-center"><Spinner /></div>}
      </div>
    </div>
  );
}
