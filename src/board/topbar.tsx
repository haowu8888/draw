import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Cloud, CloudOff, History, Loader2, Maximize, MoreVertical, Pencil, Plus, Scan, Share2, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { NameDialog } from "@/components/common";
import { AlertDialog, Avatar, Button, Kbd, Menu, MenuItem, MenuSeparator, Tooltip } from "@/components/ui";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { cn, errorMessage } from "@/lib/utils";
import type { CollabStatus, Peer } from "./collab";
import type { SaveState } from "./editor";
import { FrameNav } from "./frames";
import { useEditor } from "./editor-context";
import { ShareDialog } from "./share-dialog";
import { VersionSheet } from "./versions";

interface Props {
  title: string;
  onTitle: (t: string) => void;
  board: { id: string; title: string; visibility: string; shareRole: string; shareToken: string | null; creatorId: string };
  pages: { id: string; name: string }[];
  pageId: string;
  onSwitchPage: (id: string) => void;
  onPagesChanged: () => void;
  status: CollabStatus;
  save: SaveState;
  peers: Peer[];
}

export function TopBar({ title, onTitle, board, pages, pageId, onSwitchPage, onPagesChanged, status, save, peers }: Props) {
  const { canEdit, role, token } = useEditor();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [draft, setDraft] = useState(title);
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pageDialog, setPageDialog] = useState<"rename" | "create" | "delete" | null>(null);
  useEffect(() => setDraft(title), [title]);
  const update = useMutation(trpc.board.update.mutationOptions());
  const createPage = useMutation(trpc.board.createPage.mutationOptions());
  const renamePage = useMutation(trpc.board.renamePage.mutationOptions());
  const deletePage = useMutation(trpc.board.deletePage.mutationOptions());
  const page = pages.find((p) => p.id === pageId);

  const commitTitle = async () => {
    const t = draft.trim();
    if (!t || t === title) return setDraft(title);
    try {
      await update.mutateAsync({ id: board.id, title: t.slice(0, 128), token });
      onTitle(t);
    } catch (e) {
      setDraft(title);
      toast.error(errorMessage(e, "重命名失败"));
    }
  };

  const newPage = async (name?: string) => {
    try {
      const r = await createPage.mutateAsync({ boardId: board.id, name, token });
      await onPagesChanged();
      setTimeout(() => onSwitchPage(r.id), 50);
    } catch (e) {
      toast.error(errorMessage(e, "新建页面失败"));
    }
  };

  const others = peers.slice(0, 6);

  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center gap-1 border-b bg-[#fafafa] px-2">
      <Tooltip content="返回">
        <button className="tool-btn" aria-label="返回" onClick={() => navigate(session ? "/user/boards" : "/")}>
          <ArrowLeft />
        </button>
      </Tooltip>
      <input
        aria-label="画布名称"
        className="h-7 max-w-56 min-w-0 rounded-md bg-transparent px-1.5 text-sm font-medium outline-none hover:bg-accent focus:bg-card focus:ring-1 focus:ring-ring disabled:hover:bg-transparent"
        style={{ width: `${Math.max(4, [...draft].reduce((s, c) => s + (c.charCodeAt(0) > 255 ? 2 : 1.1), 0)) + 2}ch` }}
        value={draft}
        disabled={role !== "owner" && !canEdit}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(title);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="px-1 text-muted-foreground">/</span>
      <Menu
        align="start"
        className="w-52"
        trigger={
          <button className="flex h-7 items-center gap-1 rounded-md px-1.5 text-sm hover:bg-accent" aria-label={page?.name}>
            <span className="max-w-40 truncate">{page?.name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        }
      >
        {pages.map((p) => (
          <MenuItem key={p.id} onClick={() => onSwitchPage(p.id)}>
            <span className="flex-1 truncate">{p.name}</span>
            {p.id === pageId && <Check className="!text-foreground" />}
          </MenuItem>
        ))}
        {canEdit && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => newPage()}>
              <span className="flex-1">创建新页面</span>
              <Plus />
            </MenuItem>
          </>
        )}
      </Menu>
      {canEdit && (
        <Menu
          align="start"
          trigger={
            <button className="tool-btn" aria-label="页面操作">
              <MoreVertical />
            </button>
          }
        >
          <MenuItem onClick={() => setPageDialog("rename")}>
            <Pencil />
            重命名页面
          </MenuItem>
          <MenuItem onClick={() => setPageDialog("create")}>
            <Plus />
            创建新页面
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive disabled={pages.length <= 1} onClick={() => setPageDialog("delete")}>
            <Trash2 />
            删除页面
          </MenuItem>
        </Menu>
      )}

      <SaveIndicator status={status} save={save} readOnly={!canEdit} />

      <div className="ml-auto flex items-center gap-2">
        {others.length > 1 && (
          <div className="flex -space-x-1.5">
            {others.map((p) => (
              <Tooltip key={p.clientId} content={`${p.name}${p.pageId === pageId ? "" : "（其他页面）"}`}>
                <span>
                  <Avatar name={p.name} className="size-7 border-2 border-white text-[10px] text-white" color={p.color} />
                </span>
              </Tooltip>
            ))}
          </div>
        )}
        {session && (
          <Button size="sm" variant="outline" onClick={() => setVersionsOpen(true)}>
            <History />
            版本
          </Button>
        )}
        {role === "owner" && (
          <Button size="sm" onClick={() => setShareOpen(true)}>
            <Share2 />
            分享
          </Button>
        )}
      </div>

      {role === "owner" && <ShareDialog open={shareOpen} onOpenChange={setShareOpen} boardId={board.id} title={title} />}
      {session && <VersionSheet open={versionsOpen} onOpenChange={setVersionsOpen} />}
      <NameDialog
        open={pageDialog === "rename" || pageDialog === "create"}
        onOpenChange={(o) => !o && setPageDialog(null)}
        title={pageDialog === "rename" ? "重命名页面" : "创建新页面"}
        initial={pageDialog === "rename" ? page?.name ?? "" : `页面 ${pages.length + 1}`}
        onSubmit={async (name) => {
          if (pageDialog === "create") return newPage(name);
          try {
            await renamePage.mutateAsync({ boardId: board.id, pageId, name, token });
            onPagesChanged();
            toast.success("已重命名");
          } catch (e) {
            toast.error(errorMessage(e, "重命名页面失败"));
          }
        }}
      />
      <AlertDialog
        open={pageDialog === "delete"}
        onOpenChange={(o) => !o && setPageDialog(null)}
        title={`删除页面「${page?.name}」？`}
        description="删除后无法找回。"
        destructive
        confirmText="删除"
        loading={deletePage.isPending}
        onConfirm={async () => {
          try {
            const next = pages.find((p) => p.id !== pageId)!;
            onSwitchPage(next.id);
            await deletePage.mutateAsync({ boardId: board.id, pageId, token });
            onPagesChanged();
            setPageDialog(null);
            toast.success(`已删除「${page?.name}」`);
          } catch (e) {
            toast.error(errorMessage(e, "删除页面失败"));
          }
        }}
      />
    </header>
  );
}

function SaveIndicator({ status, save, readOnly }: { status: CollabStatus; save: SaveState; readOnly: boolean }) {
  if (readOnly) return <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">只读</span>;
  const offline = status === "offline";
  // like the original: stay quiet unless something needs attention
  if (!offline && save !== "unsaved") return null;
  const label = offline ? (save === "saved" ? "离线" : "未保存") : "未保存";
  return (
    <Tooltip content={offline ? "实时协同已断开，改动会在本地自动保存" : status === "connecting" ? "连接中…" : "自动保存"}>
      <span className={cn("ml-2 flex items-center gap-1 text-xs text-muted-foreground", offline && "text-warning-foreground")}>
        {offline ? <CloudOff className="size-3.5" /> : save === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Cloud className="size-3.5" />}
        {label}
      </span>
    </Tooltip>
  );
}

export function ZoomMenu() {
  const { api, ui } = useEditor();
  const setZoom = (value: number) => {
    const s = api.getAppState();
    const z = Math.min(30, Math.max(0.1, value));
    // keep the viewport center fixed
    const cx = s.width / 2 / s.zoom.value - s.scrollX;
    const cy = s.height / 2 / s.zoom.value - s.scrollY;
    api.updateScene({ appState: { zoom: { value: z as never }, scrollX: s.width / 2 / z - cx, scrollY: s.height / 2 / z - cy } as never });
  };
  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
      <FrameNav />
      <Menu
        align="end"
        className="w-48"
        trigger={
          <button className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-neutral-700 hover:bg-accent" aria-label={`${Math.round(ui.zoom * 100)}%`}>
            {Math.round(ui.zoom * 100)}%
            <ChevronDown className="size-3.5" />
          </button>
        }
      >
        <MenuItem onClick={() => setZoom(ui.zoom + 0.1)}>
          <ZoomIn />
          放大
          <Kbd>Ctrl +</Kbd>
        </MenuItem>
        <MenuItem onClick={() => setZoom(ui.zoom - 0.1)}>
          <ZoomOut />
          缩小
          <Kbd>Ctrl -</Kbd>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => setZoom(1)}>
          <Scan />
          重置为 100%
        </MenuItem>
        <MenuItem onClick={() => api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true })}>
          <Maximize />
          适应画布
          <Kbd>Shift 1</Kbd>
        </MenuItem>
      </Menu>
    </div>
  );
}
