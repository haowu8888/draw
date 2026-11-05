import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, FolderInput, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { NameDialog } from "@/components/common";
import { AlertDialog, Avatar, ContextMenu, Menu, MenuItem, MenuSeparator, SubMenu } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { cn, errorMessage, formatTime, relativeTime } from "@/lib/utils";

export interface BoardItem {
  id: string;
  title: string;
  folderId: string | null;
  thumbnail: string | null;
  lastEditedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
  lastEditor: { id: string; name: string; image: string | null } | null;
}

export function BoardThumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("aspect-[16/9] overflow-hidden rounded-t-[inherit] border-b bg-white", className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="size-full bg-[radial-gradient(circle,#0000000f_1px,transparent_1px)] [background-size:12px_12px]" />
      )}
    </div>
  );
}

/** Board card used by the dashboard and the board list. `actions` turns on the context / more menu. */
export function BoardCard({ board, actions, showEditor }: { board: BoardItem; actions?: boolean; showEditor?: boolean }) {
  const navigate = useNavigate();
  const inTrash = !!board.deletedAt;
  const open = () => !inTrash && navigate(`/board/${board.id}`);
  const { items, dialogs } = useBoardActions(board);
  const menu = actions ? items : null;
  const card = (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className={cn("group flex flex-col rounded-xl border bg-card text-left shadow-xs-soft transition-shadow hover:shadow-md", inTrash && "cursor-default opacity-90")}
    >
      <BoardThumb src={board.thumbnail} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{board.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {inTrash ? `删除于 ${formatTime(board.deletedAt, "MM-DD HH:mm")}` : `${relativeTime(board.lastEditedAt ?? board.updatedAt)}编辑`}
          </div>
        </div>
        {showEditor && board.lastEditor && <Avatar name={board.lastEditor.name} src={board.lastEditor.image} className="size-6 text-[10px]" />}
        {menu && (
          <div onClick={(e) => e.stopPropagation()}>
            <Menu
              align="end"
              trigger={
                <button className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="更多">
                  <MoreHorizontal className="size-4" />
                </button>
              }
            >
              {menu}
            </Menu>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      {menu ? <ContextMenu menu={menu}>{card}</ContextMenu> : card}
      {actions && dialogs}
    </>
  );
}

function useBoardActions(board: BoardItem) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const { data: folders } = useQuery(trpc.folder.list.queryOptions());
  const refresh = () => {
    qc.invalidateQueries({ queryKey: trpc.board.pathKey() });
    qc.invalidateQueries({ queryKey: trpc.folder.list.queryKey() });
  };
  const opts = { onSuccess: refresh, onError: (e: unknown) => toast.error(errorMessage(e)) };
  const update = useMutation(trpc.board.update.mutationOptions(opts));
  const duplicate = useMutation(trpc.board.duplicate.mutationOptions(opts));
  const trash = useMutation(trpc.board.trash.mutationOptions(opts));
  const restore = useMutation(trpc.board.restore.mutationOptions(opts));
  const destroy = useMutation(trpc.board.destroy.mutationOptions(opts));

  if (board.deletedAt) {
    return {
      items: (
        <>
        <MenuItem onClick={() => restore.mutateAsync({ id: board.id }).then(() => toast.success("已恢复"))}>
          <RotateCcw />
          恢复
        </MenuItem>
        <MenuItem destructive onClick={() => setDestroying(true)}>
          <Trash2 />
          彻底删除
        </MenuItem>
        </>
      ),
      dialogs: (
        <AlertDialog
          open={destroying}
          onOpenChange={setDestroying}
          title={`彻底删除「${board.title}」？`}
          description="画布内容、评论与历史版本将被永久删除，无法恢复。"
          destructive
          confirmText="彻底删除"
          loading={destroy.isPending}
          onConfirm={() =>
            destroy.mutateAsync({ id: board.id }).then(() => {
              setDestroying(false);
              toast.success(`已彻底删除 ${board.title}`);
            })
          }
        />
      ),
    };
  }

  const tree = buildFolderTree(folders ?? []);
  return {
    items: (
      <>
      <MenuItem onClick={() => navigate(`/board/${board.id}`)}>
        <ExternalLink />
        打开
      </MenuItem>
      <MenuItem onClick={() => setRenaming(true)}>
        <Pencil />
        重命名
      </MenuItem>
      <MenuItem onClick={() => duplicate.mutateAsync({ id: board.id }).then(() => toast.success("已复制"))}>
        <Copy />
        复制
      </MenuItem>
      <SubMenu label="移动到" icon={<FolderInput />}>
        <MenuItem disabled={!board.folderId} onClick={() => update.mutateAsync({ id: board.id, folderId: null }).then(() => toast.success("已移到根目录"))}>
          根目录 {!board.folderId && <span className="ml-auto text-xs text-muted-foreground">当前</span>}
        </MenuItem>
        {tree.map(({ folder, depth }) => (
          <MenuItem
            key={folder.id}
            disabled={board.folderId === folder.id}
            onClick={() => update.mutateAsync({ id: board.id, folderId: folder.id }).then(() => toast.success(`已移到${folder.name}`))}
          >
            <span style={{ paddingLeft: depth * 12 }} className="truncate">
              {folder.name}
            </span>
            {board.folderId === folder.id && <span className="ml-auto text-xs text-muted-foreground">当前</span>}
          </MenuItem>
        ))}
      </SubMenu>
      <MenuSeparator />
      <MenuItem destructive onClick={() => trash.mutateAsync({ id: board.id }).then(() => toast.success("已移入回收站"))}>
        <Trash2 />
        移入回收站
      </MenuItem>
      </>
    ),
    dialogs: (
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="重命名画布"
        initial={board.title}
        onSubmit={(title) =>
          update
            .mutateAsync({ id: board.id, title })
            .then(() => toast.success("已重命名"))
            .catch(() => undefined)
        }
      />
    ),
  };
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  sort: number;
  boardCount: number;
}

export function buildFolderTree(folders: FolderItem[]) {
  const out: { folder: FolderItem; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    folders
      .filter((f) => f.parentId === parent)
      .sort((a, b) => a.sort - b.sort)
      .forEach((f) => {
        out.push({ folder: f, depth });
        walk(f.id, depth + 1);
      });
  };
  walk(null, 0);
  // Orphans (parent deleted elsewhere) still show at the root.
  folders.filter((f) => !out.some((o) => o.folder.id === f.id)).forEach((f) => out.push({ folder: f, depth: 0 }));
  return out;
}
