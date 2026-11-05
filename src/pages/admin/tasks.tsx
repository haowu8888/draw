import { useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { FullSpinner } from "@/components/common";
import { Button, Card, Empty } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";

export default function AdminTasks() {
  const trpc = useTRPC();
  const { data, isPending, isError, refetch } = useQuery(trpc.setting.tasks.queryOptions());
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">任务队列</h1>
      <Card className="rounded-xl border-admin-divider shadow-none">
        {isPending ? (
          <FullSpinner />
        ) : isError ? (
          <Empty icon={<ListTodo />} title="配置加载失败" description="暂时无法确认任务队列状态，请重试。">
            <Button variant="outline" onClick={() => refetch()}>
              重试
            </Button>
          </Empty>
        ) : data?.enabled ? (
          <Empty icon={<ListTodo />} title="任务队列运行中" description="当前没有排队中的任务。" />
        ) : (
          <Empty icon={<ListTodo />} title="任务队列未启用" description="服务端未配置 REDIS_URL，配置后重启服务即可使用" />
        )}
      </Card>
    </div>
  );
}
