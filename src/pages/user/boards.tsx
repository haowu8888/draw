import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Folder, FolderOpen, FolderPlus, LayoutGrid, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { FullSpinner, NameDialog } from "@/components/common";
import { AlertDialog, Button, Card, Empty, Input, Menu, MenuItem, MenuSeparator } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { cn, errorMessage } from "@/lib/utils";
import { BoardCard, buildFolderTree, type FolderItem } from "./board-card";
import { useCreateBoard } from "./dashboard";

export default function UserBoards() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "all"; // all | trash | <folderId>
  const [search, setSearch] = useState("");
  const { data: folders } = useQuery(trpc.folder.list.queryOptions());
  const listInput = view === "trash" ? { trash: true, search } : view === "all" ? { all: true, search } : { folderId: view, search };
  const { data: boards, isPending } = useQuery(trpc.board.list.queryOptions(listInput));
  const { create, pending } = useCreateBoard();
  const [emptyOpen, setEmptyOpen] = useState(false);
  const emptyTrash = useMutation(trpc.board.emptyTrash.mutationOptions());
  const move = useMutation(trpc.board.update.mutationOptions());

  const folder = folders?.find((f) => f.id === view);
  const title = view === "trash" ? "回收站" : view === "all" ? "全部画布" : folder?.name ?? "文件夹";
  const select = (v: string) => setParams(v === "all" ? {} : { view: v });

  const onDropBoard = async (boardId: string, folderId: string | null) => {
    try {
      await move.mutateAsync({ id: boardId, folderId });
      qc.invalidateQueries({ queryKey: trpc.board.pathKey() });
      qc.invalidateQueries({ queryKey: trpc.folder.list.queryKey() });
      toast.success(`已移到${folderId ? folders?.find((f) => f.id === folderId)?.name : "根目录"}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col gap-1 text-sm">
        <SideItem active={view === "all"} icon={<LayoutGrid className="size-4" />} onClick={() => select("all")} onDropBoard={(id) => onDropBoard(id, null)}>
          全部画布
        </SideItem>
        <FolderTree folders={folders ?? []} active={view} onSelect={select} onDropBoard={onDropBoard} />
        <SideItem active={view === "trash"} icon={<Trash2 className="size-4" />} onClick={() => select("trash")} className="mt-2">
          回收站
        </SideItem>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="w-56 pl-8" placeholder="搜索画布" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {view === "trash" ? (
              <Button variant="destructive-outline" disabled={!boards?.length} onClick={() => setEmptyOpen(true)}>
                <Trash2 />
                清空回收站
              </Button>
            ) : (
              <Button loading={pending} onClick={() => create(folder?.id ?? null)}>
                {!pending && <Plus />}
                新建画布
              </Button>
            )}
          </div>
        </div>
        {isPending ? (
          <FullSpinner />
        ) : boards?.length ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {boards.map((b) => (
              <div key={b.id} draggable={view !== "trash"} onDragStart={(e) => e.dataTransfer.setData("application/x-board", b.id)}>
                <BoardCard board={b} actions />
              </div>
            ))}
          </div>
        ) : (
          <Card>
            {view === "trash" ? (
              <Empty icon={<Trash2 />} title="回收站是空的" description="删除的画布会在这里保留" />
            ) : (
              <Empty icon={<LayoutGrid />} title={search ? "没有找到" : "还没有画布"} description={search ? undefined : "点击「新建画布」开始创作"} />
            )}
          </Card>
        )}
      </section>

      <AlertDialog
        open={emptyOpen}
        onOpenChange={setEmptyOpen}
        title="清空回收站？"
        description="回收站中你可管理的画布将被永久删除（含评论与历史版本），无法恢复。"
        destructive
        confirmText="清空回收站"
        loading={emptyTrash.isPending}
        onConfirm={async () => {
          const n = await emptyTrash.mutateAsync();
          setEmptyOpen(false);
          qc.invalidateQueries({ queryKey: trpc.board.pathKey() });
          toast.success(n ? `已彻底删除 ${n} 个画布` : "没有可删除的画布");
        }}
      />
    </div>
  );
}

function SideItem({
  active,
  icon,
  children,
  onClick,
  className,
  depth = 0,
  onDropBoard,
  extra,
}: {
  active?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  depth?: number;
  onDropBoard?: (boardId: string) => void;
  extra?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      onClick={onClick}
      onDragOver={(e) => {
        if (onDropBoard && e.dataTransfer.types.includes("application/x-board")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData("application/x-board");
        if (id && onDropBoard) onDropBoard(id);
      }}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        "group flex h-9 items-center gap-2 rounded-lg pr-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent font-medium text-foreground",
        over && "ring-2 ring-ring/40",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {extra}
    </div>
  );
}

function FolderTree({
  folders,
  active,
  onSelect,
  onDropBoard,
}: {
  folders: FolderItem[];
  active: string;
  onSelect: (id: string) => void;
  onDropBoard: (boardId: string, folderId: string) => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: "create"; parentId: string | null } | { kind: "rename"; folder: FolderItem } | { kind: "delete"; folder: FolderItem } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: trpc.folder.list.queryKey() });
    qc.invalidateQueries({ queryKey: trpc.board.pathKey() });
  };
  const err = (e: unknown) => toast.error(errorMessage(e));
  const createF = useMutation(trpc.folder.create.mutationOptions({ onSuccess: refresh, onError: err }));
  const updateF = useMutation(trpc.folder.update.mutationOptions({ onSuccess: refresh, onError: err }));
  const removeF = useMutation(trpc.folder.remove.mutationOptions({ onSuccess: refresh, onError: err }));
  const reorder = useMutation(trpc.folder.reorder.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e, "排序失败")) }));
  const [dragId, setDragId] = useState<string | null>(null);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const hasChildren = (id: string) => folders.some((f) => f.parentId === id);
  const hiddenBy = (f: FolderItem): boolean => {
    let p = f.parentId;
    while (p) {
      if (collapsed.has(p)) return true;
      p = folders.find((x) => x.id === p)?.parentId ?? null;
    }
    return false;
  };

  /** Drops folder `dragId` before `target` among target's siblings. */
  const dropFolder = (target: FolderItem) => {
    if (!dragId || dragId === target.id) return;
    const siblings = folders.filter((f) => f.parentId === target.parentId && f.id !== dragId).sort((a, b) => a.sort - b.sort);
    const idx = siblings.findIndex((f) => f.id === target.id);
    const ids = siblings.map((f) => f.id);
    ids.splice(idx, 0, dragId);
    reorder.mutate({ ids, parentId: target.parentId });
  };

  return (
    <div className="mt-2">
      <div className="flex h-8 items-center justify-between pr-1 pl-2 text-xs text-muted-foreground">
        文件夹
        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="新建文件夹" onClick={() => setDialog({ kind: "create", parentId: null })}>
          <FolderPlus className="size-4" />
        </button>
      </div>
      {!folders.length && <div className="px-2 py-1 text-xs text-muted-foreground">暂无文件夹</div>}
      {tree
        .filter(({ folder }) => !hiddenBy(folder))
        .map(({ folder, depth }) => (
          <div
            key={folder.id}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              setDragId(folder.id);
              e.dataTransfer.setData("application/x-folder", folder.id);
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => dragId && e.dataTransfer.types.includes("application/x-folder") && e.preventDefault()}
            onDrop={(e) => {
              if (e.dataTransfer.types.includes("application/x-folder")) dropFolder(folder);
            }}
          >
            <SideItem
              depth={depth}
              active={active === folder.id}
              onClick={() => onSelect(folder.id)}
              onDropBoard={(id) => onDropBoard(id, folder.id)}
              icon={
                <span className="flex items-center">
                  <button
                    className={cn("-ml-1 rounded p-0.5", !hasChildren(folder.id) && "invisible")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((s) => {
                        const n = new Set(s);
                        n.has(folder.id) ? n.delete(folder.id) : n.add(folder.id);
                        return n;
                      });
                    }}
                  >
                    <ChevronRight className={cn("size-3 transition-transform", !collapsed.has(folder.id) && "rotate-90")} />
                  </button>
                  {active === folder.id ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
                </span>
              }
              extra={
                <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground group-hover:hidden">{folder.boardCount || ""}</span>
                  <Menu
                    align="start"
                    trigger={
                      <button className="hidden rounded p-1 group-hover:inline-flex hover:bg-background data-[popup-open]:inline-flex" aria-label="更多">
                        <MoreHorizontal className="size-4" />
                      </button>
                    }
                  >
                    <MenuItem onClick={() => setDialog({ kind: "create", parentId: folder.id })}>
                      <FolderPlus />
                      新建子文件夹
                    </MenuItem>
                    <MenuItem onClick={() => setDialog({ kind: "rename", folder })}>
                      <Pencil />
                      重命名
                    </MenuItem>
                    <MenuItem disabled={!folder.parentId} onClick={() => updateF.mutate({ id: folder.id, parentId: null })}>
                      <Folder />
                      移到根目录
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive onClick={() => setDialog({ kind: "delete", folder })}>
                      <Trash2 />
                      删除
                    </MenuItem>
                  </Menu>
                </span>
              }
            >
              {folder.name}
            </SideItem>
          </div>
        ))}
      <NameDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "rename" ? "重命名文件夹" : "新建文件夹"}
        initial={dialog?.kind === "rename" ? dialog.folder.name : ""}
        placeholder="文件夹名称"
        onSubmit={async (name) => {
          if (dialog?.kind === "rename") await updateF.mutateAsync({ id: dialog.folder.id, name });
          else if (dialog?.kind === "create") {
            const r = await createF.mutateAsync({ name, parentId: dialog.parentId });
            onSelect(r.id);
          }
        }}
      />
      <AlertDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "delete" ? `删除文件夹「${dialog.folder.name}」？` : ""}
        description="子文件夹一并删除，其中的画布会移到根目录。"
        destructive
        confirmText="删除"
        loading={removeF.isPending}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await removeF.mutateAsync({ id: dialog.folder.id });
          if (active === dialog.folder.id) onSelect("all");
          setDialog(null);
          toast.success("文件夹已删除");
        }}
      />
    </div>
  );
}
