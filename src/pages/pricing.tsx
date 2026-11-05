import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Monitor, QrCode, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Announcement, Logo, UserAvatarMenu } from "@/components/common";
import { Badge, Button, Dialog, Spinner } from "@/components/ui";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { cn, errorMessage } from "@/lib/utils";

export default function Pricing() {
  const trpc = useTRPC();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { data: plans } = useQuery(trpc.price.plans.queryOptions());
  const [order, setOrder] = useState<{ id: string; amount: number; planName: string } | null>(null);
  const create = useMutation(trpc.price.createOrder.mutationOptions());

  const buy = async (plan: { id: string; name: string }) => {
    if (!session) return navigate(`/login?redirect=/pricing`);
    try {
      const r = await create.mutateAsync({ planId: plan.id });
      setOrder({ id: r.id, amount: r.amount, planName: plan.name });
    } catch (e) {
      toast.error(errorMessage(e, "创建订单失败"));
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <Announcement />
      <header className="mx-auto flex h-14 w-full max-w-[67.5rem] items-center justify-between px-6">
        <Logo />
        {session ? (
          <UserAvatarMenu />
        ) : (
          <Link to="/login">
            <Button size="sm" variant="outline">
              登录
            </Button>
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-[67.5rem] px-6 py-14">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">定价</h1>
          <p className="mt-3 text-muted-foreground">开始你的 Draw 之旅。</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
          {plans?.map((p) => (
            <div key={p.id} className={cn("relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs-soft", p.popular && "border-neutral-400 bg-neutral-50 shadow-lg dark:bg-neutral-900")}>
              {p.popular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white">
                  <Sparkles className="size-3" />
                  最受欢迎
                </Badge>
              )}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Monitor className="size-3.5" />
                {p.name}
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">¥{(p.price / 100).toFixed(1)}</div>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" variant={p.popular ? "default" : "outline"} loading={create.isPending && create.variables?.planId === p.id} onClick={() => buy(p)}>
                立即购买
              </Button>
            </div>
          ))}
        </div>
      </main>
      <PayDialog order={order} onClose={() => setOrder(null)} />
    </div>
  );
}

function PayDialog({ order, onClose }: { order: { id: string; amount: number; planName: string } | null; onClose: () => void }) {
  const trpc = useTRPC();
  const { data, refetch, isError, isFetching } = useQuery({
    ...trpc.price.getOrder.queryOptions({ id: order?.id ?? "" }),
    enabled: !!order,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 2000 : false),
  });
  const pay = useMutation(trpc.price.mockPay.mutationOptions());
  const status = data?.status ?? "pending";
  useEffect(() => {
    if (status === "paid") {
      toast.success("支付成功");
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
  }, [status, onClose]);
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()} title={`购买 ${order?.planName ?? ""}`} description="使用微信 / 支付宝扫码支付" className="max-w-sm">
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="text-3xl font-semibold">¥{((order?.amount ?? 0) / 100).toFixed(2)}</div>
        <div className="relative flex size-52 items-center justify-center rounded-xl border bg-white">
          {status === "pending" ? (
            <QrCode className="size-40 text-neutral-800" strokeWidth={1} />
          ) : (
            <div className="text-center text-sm">
              {status === "paid" && <Check className="mx-auto mb-2 size-10 text-emerald-600" />}
              {{ paid: "订单已支付", cancelled: "订单已取消，请关闭后重新下单", refunded: "订单已退款", failed: "支付失败，请关闭后重新下单", pending: "" }[status]}
            </div>
          )}
        </div>
        {isError ? (
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isFetching && <Spinner className="size-3" />}
            支付完成后弹窗会自动关闭
          </p>
        )}
        {status === "pending" && (
          <Button size="sm" variant="secondary" loading={pay.isPending} onClick={() => order && pay.mutateAsync({ id: order.id }).then(() => refetch())}>
            模拟支付（开发环境）
          </Button>
        )}
        {status !== "pending" && (
          <Button className="w-full" onClick={onClose}>
            {status === "paid" ? "完成" : "关闭"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
