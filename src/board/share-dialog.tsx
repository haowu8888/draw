import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, Dialog, Input, Label, Select, Separator } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { copyText, errorMessage } from "@/lib/utils";
import { embedUrl, shareUrl } from "@/pages/user/shared-boards";

export function ShareDialog({ open, onOpenChange, boardId, title }: { open: boolean; onOpenChange: (o: boolean) => void; boardId: string; title: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data } = useQuery({ ...trpc.board.get.queryOptions({ id: boardId }), enabled: open, select: (d) => d.board });
  const share = useMutation(
    trpc.board.share.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.board.get.queryKey({ id: boardId }) });
        qc.invalidateQueries({ queryKey: trpc.board.listShared.queryKey() });
      },
      onError: (e) => toast.error(errorMessage(e, "分享设置失败")),
    }),
  );
  const isLink = data?.visibility === "link" && !!data.shareToken;
  const link = isLink ? shareUrl(data.shareToken!) : "";
  const embed = isLink ? embedUrl(data.shareToken!) : "";
  const copy = (s: string) => copyText(s).then(() => toast.success("已复制"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`分享「${title}」`} description="选择「仅自己」即关闭分享，已发出的链接立即失效" className="max-w-md">
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center justify-between gap-4">
          <Label>访问范围</Label>
          <Select
            className="w-48"
            value={isLink ? "link" : "private"}
            onValueChange={(v) => share.mutate({ id: boardId, visibility: v as "private" | "link" })}
            options={[
              { value: "private", label: "仅自己" },
              { value: "link", label: "任何获得链接的人" },
            ]}
          />
        </div>
        {isLink && (
          <>
            <div className="flex items-center justify-between gap-4">
              <Label>链接权限</Label>
              <Select
                className="w-48"
                value={data.shareRole}
                onValueChange={(v) => share.mutate({ id: boardId, role: v as "view" | "edit" })}
                options={[
                  { value: "view", label: "可查看" },
                  { value: "edit", label: "可编辑" },
                ]}
              />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">未登录的访问者只能查看；编辑需要登录。</p>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={() => copy(link)}>
                <Copy />
                复制链接
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              loading={share.isPending && share.variables?.resetToken}
              onClick={() => share.mutateAsync({ id: boardId, resetToken: true }).then(() => toast.success("已重置链接，旧链接失效"))}
            >
              <RefreshCw />
              重置链接
            </Button>
            <Separator />
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Code className="size-4" />
                嵌入到文档
              </div>
              <p className="mt-1 text-xs text-muted-foreground">粘贴到文档中嵌入，只显示画布内容（只读）。分享链接放进文档也会自动按嵌入显示。</p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={`<iframe src="${embed}" width="800" height="500" frameborder="0"></iframe>`} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="outline" onClick={() => copy(embed)}>
                  复制嵌入链接
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
