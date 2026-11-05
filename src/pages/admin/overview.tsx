import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, FilePen, MessageSquare, PenTool, Upload, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FullSpinner } from "@/components/common";
import { Avatar, Button, Card, Empty, Table } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "newUsers", label: "新注册用户", icon: UserPlus, unit: "人" },
  { key: "activeUsers", label: "活跃用户", icon: Users, unit: "人" },
  { key: "creates", label: "新建画布", icon: PenTool, unit: "个" },
  { key: "edits", label: "编辑次数", icon: FilePen, unit: "次" },
  { key: "comments", label: "评论", icon: MessageSquare, unit: "条" },
  { key: "uploads", label: "上传文件", icon: Upload, unit: "次" },
] as const;

const SERIES = [
  { key: "edit", label: "编辑", color: "#4f7cff" },
  { key: "create", label: "新建画布", color: "#22c3a6" },
  { key: "comment", label: "评论", color: "#ffb020" },
  { key: "upload", label: "上传文件", color: "#a78bfa" },
];

export default function AdminOverview() {
  const trpc = useTRPC();
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const { data, isPending } = useQuery(trpc.board.usageReport.queryOptions({ month }));
  const shift = (n: number) => setMonth(dayjs(`${month}-01`).add(n, "month").format("YYYY-MM"));
  const isCurrent = month === dayjs().format("YYYY-MM");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">画布用量</h1>
          <p className="text-sm text-muted-foreground">同一画布 10 分钟内的保存计为一次编辑</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" aria-label="上月" onClick={() => shift(-1)}>
            <ChevronLeft />
          </Button>
          <span className="w-24 text-center text-sm font-medium">{dayjs(`${month}-01`).format("YYYY年MM月")}</span>
          <Button size="icon-sm" variant="outline" aria-label="下月" disabled={isCurrent} onClick={() => shift(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      {isPending || !data ? (
        <FullSpinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {METRICS.map((m) => {
              const v = data.metrics[m.key];
              const diff = v.current - v.previous;
              return (
                <Card key={m.key} className="rounded-xl border-admin-divider bg-card p-4 shadow-none">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <m.icon className="size-3.5" />
                    {m.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {v.current}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{m.unit}</span>
                  </div>
                  <div className={cn("mt-1 text-xs", diff > 0 ? "text-success-foreground" : diff < 0 ? "text-destructive-foreground" : "text-muted-foreground")}>
                    较上月 {diff > 0 ? "+" : ""}
                    {diff}
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="rounded-xl border-admin-divider p-4 shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">每日用量趋势</h2>
              <span className="text-xs text-muted-foreground">
                用户 {data.totals.users} · 画布 {data.totals.boards}
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend.map((d) => ({ ...d, day: d.date.slice(8) }))} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={(l) => `${month}-${l}`} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  {SERIES.map((s) => (
                    <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="rounded-xl border-admin-divider p-4 shadow-none">
            <h2 className="mb-3 text-sm font-semibold">用户活跃排名</h2>
            {(data.ranking as unknown[]).length ? (
              <Table className="rounded-lg">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>编辑</th>
                    <th>新建</th>
                    <th>评论</th>
                    <th>上传</th>
                    <th>活跃度</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.ranking as { userId: string; name: string | null; email: string | null; image: string | null; edits: number; creates: number; uploads: number; comments: number; total: number }[]).map((r) => {
                    const max = (data.ranking as { total: number }[])[0]?.total || 1;
                    return (
                      <tr key={r.userId}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar name={r.name} src={r.image} className="size-6 text-[10px]" />
                            <div>
                              <div className="text-sm">{r.name ?? "已注销"}</div>
                              <div className="text-xs text-muted-foreground">{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{r.edits}</td>
                        <td>{r.creates}</td>
                        <td>{r.comments}</td>
                        <td>{r.uploads}</td>
                        <td className="w-40">
                          <div className="h-1.5 rounded-full bg-muted">
                            <div className="h-full rounded-full bg-neutral-800" style={{ width: `${(r.total / max) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <Empty title="本月暂无用户活动" className="py-8" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
