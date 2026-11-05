import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FullSpinner, Pagination } from "@/components/common";
import { AlertDialog, Badge, Button, Dialog, Empty, Select, Table } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { errorMessage, formatTime } from "@/lib/utils";

const STATUS: Record<string, { label: string; variant: "warning" | "success" | "secondary" | "info" | "destructive" }> = {
  pending: { label: "待支付", variant: "warning" },
  paid: { label: "已支付", variant: "success" },
  cancelled: { label: "已取消", variant: "secondary" },
  refunded: { label: "已退款", variant: "info" },
  failed: { label: "失败", variant: "destructive" },
};

const CHANNEL: Record<string, string> = { mock: "模拟支付", wechat: "微信支付", alipay: "支付宝" };

export default function AdminOrders() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const { data, isPending, isError, refetch, isFetching } = useQuery(trpc.price.orders.queryOptions({ page, pageSize: 20, status: status === "all" ? undefined : status }));
  const remove = useMutation(trpc.price.deleteOrder.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.price.orders.queryKey() }) }));
  type Order = NonNullable<typeof data>["items"][number];
  const [detail, setDetail] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState<Order | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">订单管理</h1>
        <div className="flex gap-2">
          <Select
            className="w-32"
            value={status}
            onValueChange={(s) => {
              setStatus(s);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部" }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))]}
          />
          <Button variant="outline" loading={isFetching && !isPending} onClick={() => refetch().then((r) => r.isError && toast.error("订单刷新失败，请重试"))}>
            {!(isFetching && !isPending) && <RefreshCw />}
            刷新
          </Button>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>商户订单号</th>
            <th>下单用户</th>
            <th>方案</th>
            <th>金额</th>
            <th>渠道</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>支付时间</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {isPending ? (
            <tr>
              <td colSpan={9}>
                <FullSpinner />
              </td>
            </tr>
          ) : isError ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-muted-foreground">
                订单加载失败，请重试
              </td>
            </tr>
          ) : !data?.items.length ? (
            <tr>
              <td colSpan={9}>
                <Empty title="暂无订单" />
              </td>
            </tr>
          ) : (
            data.items.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.outTradeNo}</td>
                <td>{o.userName ? <span title={o.userEmail ?? ""}>{o.userName}</span> : <span className="text-muted-foreground">用户已注销</span>}</td>
                <td>{o.planName}</td>
                <td>¥{(o.amount / 100).toFixed(2)}</td>
                <td>{CHANNEL[o.channel] ?? o.channel}</td>
                <td>
                  <Badge variant={STATUS[o.status]?.variant}>{STATUS[o.status]?.label ?? o.status}</Badge>
                </td>
                <td className="whitespace-nowrap">{formatTime(o.createdAt)}</td>
                <td className="whitespace-nowrap">{formatTime(o.paidAt)}</td>
                <td className="text-right whitespace-nowrap">
                  <Button size="icon-sm" variant="ghost" aria-label="详情" onClick={() => setDetail(o)}>
                    <Eye />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="删除" onClick={() => setDeleting(o)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {data && <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} />}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title="订单详情" className="max-w-lg">
        {detail && (
          <dl className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-2.5 pb-2 text-sm">
            {(
              [
                ["订单 ID", detail.id],
                ["商户订单号", detail.outTradeNo],
                ["渠道订单号", detail.channelTradeNo ?? "-"],
                ["下单用户", detail.userName ? `${detail.userName}（${detail.userEmail}）` : "用户已注销"],
                ["方案", detail.planName],
                ["金额", `¥${(detail.amount / 100).toFixed(2)}`],
                ["货币", detail.currency],
                ["支付渠道", CHANNEL[detail.channel] ?? detail.channel],
                ["状态", STATUS[detail.status]?.label ?? detail.status],
                ["创建时间", formatTime(detail.createdAt)],
                ["支付时间", formatTime(detail.paidAt)],
                ["过期时间", formatTime(detail.expiresAt)],
                ["更新时间", formatTime(detail.updatedAt)],
                ["元数据", JSON.stringify(detail.metadata)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="删除订单？"
        description={`订单 ${deleting?.outTradeNo} 删除后无法恢复。`}
        destructive
        confirmText="删除"
        loading={remove.isPending}
        onConfirm={() =>
          remove
            .mutateAsync({ id: deleting!.id })
            .then(() => (setDeleting(null), toast.success("删除成功")))
            .catch((e) => toast.error(errorMessage(e, "删除失败")))
        }
      />
    </div>
  );
}
