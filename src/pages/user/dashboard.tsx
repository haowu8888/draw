import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, FilePen, LayoutGrid, MessageSquare, PenTool, Plus, UserRoundPen } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { FullSpinner } from "@/components/common";
import { Button, Card, Empty } from "@/components/ui";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { errorMessage } from "@/lib/utils";
import { BoardCard } from "./board-card";
import { SharedBoards } from "./shared-boards";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "上午好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function useCreateBoard() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const m = useMutation(trpc.board.create.mutationOptions());
  return {
    pending: m.isPending,
    create: (folderId?: string | null) =>
      m
        .mutateAsync({ folderId })
        .then((b) => navigate(`/board/${b.id}`))
        .catch((e) => toast.error(errorMessage(e, "新建画布失败"))),
  };
}

export default function UserDashboard() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data, isPending } = useQuery(trpc.board.overview.queryOptions());
  const { create, pending } = useCreateBoard();

  const stats = [
    { label: "画布", value: data?.stats.boards, icon: PenTool },
    { label: "我创建的", value: data?.stats.createdByMe, icon: UserRoundPen },
    { label: "近 7 天编辑", value: data?.stats.editedThisWeek, icon: FilePen },
    { label: "未解决评论", value: data?.stats.openComments, icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {greeting()}，{session?.user.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">继续上次的创作，或者新建一个画布</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/user/boards")}>
            <LayoutGrid />
            全部画布
          </Button>
          <Button loading={pending} onClick={() => create()}>
            {!pending && <Plus />}
            新建画布
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <s.icon className="size-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg leading-tight font-semibold">{s.value ?? "-"}</div>
            </div>
          </Card>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">最近编辑</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/user/boards")}>
            查看全部
            <ArrowRight />
          </Button>
        </div>
        {isPending ? (
          <FullSpinner />
        ) : data?.recent.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.recent.map((b) => (
              <BoardCard key={b.id} board={b} showEditor />
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon={<PenTool />} title="还没有画布" description="新建一个画布，开始画流程图、架构图或随手涂鸦">
              <Button onClick={() => create()} loading={pending}>
                新建画布
              </Button>
            </Empty>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">分享中的画布</h2>
        <SharedBoards />
      </section>
    </div>
  );
}
