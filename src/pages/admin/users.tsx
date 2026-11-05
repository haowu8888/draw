import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, KeyRound, MonitorSmartphone, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";
import { FullSpinner, Pagination } from "@/components/common";
import { AlertDialog, Avatar, Badge, Button, Dialog, Empty, Field, Input, Menu, MenuItem, MenuSeparator, Select, Table, Textarea } from "@/components/ui";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { errorMessage, formatTime } from "@/lib/utils";
import { PasswordInput } from "../auth/shared";

type User = { id: string; name: string; email: string; role: string | null; banned: boolean; banReason: string | null; bio: string | null; createdAt: string; paid: number; emailVerified: boolean };
type Action = "edit" | "role" | "ban" | "unban" | "password" | "sessions" | "delete";

export default function AdminUsers() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useQuery(trpc.user.list.queryOptions({ search, page, pageSize: 20 }));
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<{ kind: Action; user: User } | null>(null);
  const { data: session } = useSession();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">用户管理</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-56 pl-8"
              placeholder="搜索用户名..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            创建用户
          </Button>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>用户</th>
            <th>角色</th>
            <th>状态</th>
            <th>余额</th>
            <th>创建时间</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {isPending ? (
            <tr>
              <td colSpan={6}>
                <FullSpinner />
              </td>
            </tr>
          ) : isError ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                用户加载失败，请重试{" "}
                <Button size="xs" variant="outline" onClick={() => refetch()}>
                  重试
                </Button>
              </td>
            </tr>
          ) : !data?.items.length ? (
            <tr>
              <td colSpan={6}>
                <Empty title="暂无用户" />
              </td>
            </tr>
          ) : (
            data.items.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} className="size-7 text-[10px]" />
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>{u.role === "admin" ? <Badge variant="info">管理员</Badge> : <Badge>普通用户</Badge>}</td>
                <td>{u.banned ? <Badge variant="destructive">已封禁</Badge> : <Badge variant="success">正常</Badge>}</td>
                <td>¥{(u.paid / 100).toFixed(2)}</td>
                <td className="whitespace-nowrap">{formatTime(u.createdAt)}</td>
                <td className="text-right">
                  <Menu
                    align="end"
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label="操作">
                        <MoreHorizontal />
                      </Button>
                    }
                  >
                    <MenuItem onClick={() => setAction({ kind: "edit", user: u })}>
                      <Pencil />
                      编辑
                    </MenuItem>
                    <MenuItem disabled={u.id === session?.user.id} onClick={() => setAction({ kind: "role", user: u })}>
                      <ShieldCheck />
                      设置角色
                    </MenuItem>
                    <MenuItem onClick={() => setAction({ kind: "password", user: u })}>
                      <KeyRound />
                      重置密码
                    </MenuItem>
                    <MenuItem onClick={() => setAction({ kind: "sessions", user: u })}>
                      <MonitorSmartphone />
                      会话管理
                    </MenuItem>
                    <MenuSeparator />
                    {u.banned ? (
                      <MenuItem onClick={() => setAction({ kind: "unban", user: u })}>
                        <UserCheck />
                        解封
                      </MenuItem>
                    ) : (
                      <MenuItem disabled={u.id === session?.user.id} onClick={() => setAction({ kind: "ban", user: u })}>
                        <Ban />
                        封禁
                      </MenuItem>
                    )}
                    <MenuItem destructive disabled={u.id === session?.user.id} onClick={() => setAction({ kind: "delete", user: u })}>
                      <Trash2 />
                      删除用户
                    </MenuItem>
                  </Menu>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {data && <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} />}
      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      <UserActionDialogs action={action} onClose={() => setAction(null)} />
    </div>
  );
}

function useRefresh() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: trpc.user.list.queryKey() });
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const create = useMutation(trpc.user.create.mutationOptions());
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as "user" | "admin" });
  const submit = async () => {
    if (!form.name.trim()) return toast.error("请输入姓名");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error("请输入有效的邮箱地址");
    if (form.password.length < 8) return toast.error("密码至少 8 位");
    try {
      await create.mutateAsync(form);
      toast.success("创建成功");
      refresh();
      onOpenChange(false);
      setForm({ name: "", email: "", password: "", role: "user" });
    } catch (e) {
      toast.error(errorMessage(e, "创建失败"));
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="创建用户"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button loading={create.isPending} onClick={submit}>
            创建
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="姓名">
          <Input value={form.name} placeholder="请输入姓名" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="邮箱">
          <Input value={form.email} placeholder="user@example.com" onChange={(e) => setForm({ ...form, email: e.target.value.trim() })} />
        </Field>
        <Field label="密码">
          <PasswordInput value={form.password} placeholder="至少 8 位" onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="用户角色">
          <Select
            value={form.role}
            onValueChange={(role) => setForm({ ...form, role })}
            options={[
              { value: "user", label: "普通用户" },
              { value: "admin", label: "管理员" },
            ]}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function UserActionDialogs({ action, onClose }: { action: { kind: Action; user: User } | null; onClose: () => void }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
      refresh();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const update = useMutation(trpc.user.update.mutationOptions());
  const setRole = useMutation(trpc.user.setRole.mutationOptions());
  const ban = useMutation(trpc.user.ban.mutationOptions());
  const unban = useMutation(trpc.user.unban.mutationOptions());
  const resetPassword = useMutation(trpc.user.resetPassword.mutationOptions());
  const remove = useMutation(trpc.user.remove.mutationOptions());
  const u = action?.user;
  const [form, setForm] = useState({ name: "", email: "", bio: "", role: "user" as "user" | "admin", reason: "", days: "never", password: "" });
  const [last, setLast] = useState<typeof action>(null);
  if (action !== last) {
    setLast(action);
    if (u) setForm({ name: u.name, email: u.email, bio: u.bio ?? "", role: (u.role as "user" | "admin") ?? "user", reason: "", days: "never", password: "" });
  }
  if (!action || !u) return null;
  const footer = (onOk: () => void, loading: boolean, text = "确定", destructive = false) => (
    <>
      <Button variant="ghost" onClick={onClose}>
        取消
      </Button>
      <Button variant={destructive ? "destructive" : "default"} loading={loading} onClick={onOk}>
        {text}
      </Button>
    </>
  );

  switch (action.kind) {
    case "edit":
      return (
        <Dialog open onOpenChange={(o) => !o && onClose()} title={`编辑用户 · ${u.name}`} footer={footer(() => run(update.mutateAsync({ id: u.id, name: form.name, email: form.email, bio: form.bio }), "已保存"), update.isPending, "保存")}>
          <div className="flex flex-col gap-3">
            <Field label="用户昵称">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="邮箱">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="用户描述">
              <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </Field>
          </div>
        </Dialog>
      );
    case "role":
      return (
        <Dialog open onOpenChange={(o) => !o && onClose()} title={`设置用户角色: ${u.name}`} className="max-w-sm" footer={footer(() => run(setRole.mutateAsync({ id: u.id, role: form.role }), "已设置"), setRole.isPending)}>
          <Select
            value={form.role}
            onValueChange={(role) => setForm({ ...form, role })}
            options={[
              { value: "user", label: "普通用户" },
              { value: "admin", label: "管理员" },
            ]}
          />
        </Dialog>
      );
    case "ban":
      return (
        <Dialog
          open
          onOpenChange={(o) => !o && onClose()}
          title={`封禁用户 · ${u.name}`}
          description="封禁后该用户的所有会话会立即失效。"
          className="max-w-md"
          footer={footer(() => (form.reason.trim() ? run(ban.mutateAsync({ id: u.id, reason: form.reason.trim(), expiresInDays: form.days === "never" ? null : Number(form.days) }), "已封禁") : toast.error("请填写封禁原因")), ban.isPending, "封禁", true)}
        >
          <div className="flex flex-col gap-3">
            <Field label="封禁原因">
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            <Field label="封禁时长">
              <Select
                value={form.days}
                onValueChange={(days) => setForm({ ...form, days })}
                options={[
                  { value: "1", label: "1 天" },
                  { value: "7", label: "7 天" },
                  { value: "30", label: "30 天" },
                  { value: "never", label: "永久" },
                ]}
              />
            </Field>
          </div>
        </Dialog>
      );
    case "unban":
      return <AlertDialog open onOpenChange={(o) => !o && onClose()} title={`解封「${u.name}」？`} description={u.banReason ? `封禁原因：${u.banReason}` : undefined} confirmText="解封" loading={unban.isPending} onConfirm={() => run(unban.mutateAsync({ id: u.id }), "已解封")} />;
    case "password":
      return (
        <Dialog open onOpenChange={(o) => !o && onClose()} title={`重置密码 · ${u.name}`} className="max-w-sm" footer={footer(() => (form.password.length < 8 ? toast.error("密码至少8位") : run(resetPassword.mutateAsync({ id: u.id, password: form.password }), "密码已重置")), resetPassword.isPending)}>
          <PasswordInput autoFocus placeholder="新密码（至少 8 位）" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Dialog>
      );
    case "delete":
      return (
        <AlertDialog
          open
          onOpenChange={(o) => !o && onClose()}
          title={`删除用户「${u.name}」？`}
          description="将永久删除该用户及其画布、文件夹、API Key 与评论，订单记录会保留。"
          destructive
          confirmText="删除"
          loading={remove.isPending}
          onConfirm={() => run(remove.mutateAsync({ id: u.id }), "已删除")}
        />
      );
    case "sessions":
      return <SessionsDialog user={u} onClose={onClose} />;
  }
}

function SessionsDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(trpc.user.sessions.queryOptions({ id: user.id }));
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.user.sessions.queryKey({ id: user.id }) });
  const revoke = useMutation(trpc.user.revokeSession.mutationOptions({ onSuccess: refresh }));
  const revokeAll = useMutation(trpc.user.revokeAllSessions.mutationOptions({ onSuccess: refresh }));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`会话管理 · ${user.name}`}
      className="max-w-3xl"
      footer={
        <Button variant="destructive-outline" disabled={!data?.length} loading={revokeAll.isPending} onClick={() => revokeAll.mutateAsync({ id: user.id }).then(() => toast.success("已撤销全部会话"))}>
          撤销全部会话
        </Button>
      }
    >
      {isPending ? (
        <FullSpinner />
      ) : !data?.length ? (
        <Empty title="暂无活动会话" className="py-8" />
      ) : (
        <Table className="rounded-xl">
          <thead>
            <tr>
              <th>设备 / 浏览器</th>
              <th>地址</th>
              <th>创建时间</th>
              <th>过期时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((s) => {
              const ua = s.userAgent ? UAParser(s.userAgent) : null;
              return (
                <tr key={s.id}>
                  <td>
                    {ua ? `${ua.browser.name ?? ""} ${ua.browser.major ?? ""} · ${ua.os.name ?? ""}` : "未知设备"}
                    {s.impersonatedBy && <Badge className="ml-1">被谁模拟</Badge>}
                  </td>
                  <td>{s.ipAddress ?? "-"}</td>
                  <td className="whitespace-nowrap">{formatTime(s.createdAt)}</td>
                  <td className="whitespace-nowrap">{formatTime(s.expiresAt)}</td>
                  <td className="text-right">
                    <Button size="xs" variant="outline" onClick={() => revoke.mutateAsync({ id: s.id }).then(() => toast.success("会话已撤销"))}>
                      撤销
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Dialog>
  );
}
