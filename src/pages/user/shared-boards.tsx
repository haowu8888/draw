import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code, Link2, MoreHorizontal, Pencil, Unlink } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge, Card, Menu, MenuItem, MenuSeparator } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { copyText, errorMessage, relativeTime } from "@/lib/utils";
import { BoardThumb } from "./board-card";

export const shareUrl = (token: string) => `${location.origin}/share/${token}`;
export const embedUrl = (token: string) => `${location.origin}/embed/${token}`;

export function SharedBoards() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery(trpc.board.listShared.queryOptions());
  const share = useMutation(
    trpc.board.share.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: trpc.board.pathKey() }),
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );
  if (!data?.length) {
    return <Card className="px-6 py-6 text-center text-sm text-muted-foreground">还没有分享的画布，在画布右上角「分享」中开启链接分享</Card>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {data.map((b) => (
        <div key={b.id} role="button" onClick={() => navigate(`/board/${b.id}`)} className="flex flex-col rounded-xl border bg-card shadow-xs-soft transition-shadow hover:shadow-md">
          <BoardThumb src={b.thumbnail} />
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{b.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant={b.shareRole === "edit" ? "warning" : "info"}>{b.shareRole === "edit" ? "可编辑" : "可查看"}</Badge>
                {relativeTime(b.lastEditedAt ?? b.updatedAt)}编辑
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <Menu
                align="end"
                trigger={
                  <button className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" aria-label="更多">
                    <MoreHorizontal className="size-4" />
                  </button>
                }
              >
                <MenuItem onClick={() => navigate(`/board/${b.id}`)}>
                  <Pencil />
                  编辑
                </MenuItem>
                <MenuItem onClick={() => b.shareToken && copyText(shareUrl(b.shareToken)).then(() => toast.success("已复制"))}>
                  <Link2 />
                  复制分享链接
                </MenuItem>
                <MenuItem onClick={() => b.shareToken && copyText(embedUrl(b.shareToken)).then(() => toast.success("已复制"))}>
                  <Code />
                  复制嵌入链接
                </MenuItem>
                <MenuSeparator />
                <MenuItem destructive onClick={() => share.mutateAsync({ id: b.id, visibility: "private" }).then(() => toast.success("已停止分享，原链接失效"))}>
                  <Unlink />
                  停止分享
                </MenuItem>
              </Menu>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
