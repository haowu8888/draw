import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";
import { FullSpinner } from "@/components/common";
import { AlertDialog, Badge, Button, Card, Field, Input, SegmentTabs, Select, Table, Textarea } from "@/components/ui";
import { authClient, useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { errorMessage, formatTime } from "@/lib/utils";
import { PasswordInput } from "../auth/shared";

type Tab = "general" | "security" | "subscription" | "danger";

export default function UserSettings() {
  const [tab, setTab] = useState<Tab>("general");
  return (
    <div className="flex flex-col gap-5">
      <SegmentTabs
        value={tab}
        onValueChange={setTab}
        className="self-start"
        items={[
          { value: "general", label: "常规" },
          { value: "security", label: "安全" },
          { value: "subscription", label: "订阅" },
          { value: "danger", label: "危险操作" },
        ]}
      />
      {tab === "general" && <GeneralSettings />}
      {tab === "security" && <SecuritySettings />}
      {tab === "subscription" && <SubscriptionSettings />}
      {tab === "danger" && <DangerZone />}
    </div>
  );
}

function GeneralSettings() {
  const { data, refetch } = useSession();
  const trpc = useTRPC();
  const save = useMutation(trpc.user.updateProfile.mutationOptions());
  const user = data?.user as { name: string; gender?: string | null; bio?: string | null } | undefined;
  const [form, setForm] = useState({ name: user?.name ?? "", gender: (user?.gender as "male" | "female" | "secret") || "secret", bio: user?.bio ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "请输入姓名";
    else if (form.name.length > 100) e.name = "昵称长度不能超过100字符";
    if (form.bio.length > 500) e.bio = "简介长度不能超过500字符";
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await save.mutateAsync({ ...form, name: form.name.trim() });
      try {
        await refetch();
        toast.success("保存成功");
      } catch {
        toast.warning("资料已保存，但刷新失败");
      }
    } catch (err) {
      toast.error(errorMessage(err, "保存失败"), { description: "请稍后重试" });
    }
  };
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-sm font-semibold">个人信息</h2>
      <Field label="邮箱">
        <Input value={data?.user.email ?? ""} disabled />
      </Field>
      <Field label="姓名" error={errors.name}>
        <Input value={form.name} placeholder="请输入姓名" onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="性别">
        <Select
          value={form.gender}
          onValueChange={(gender) => setForm({ ...form, gender })}
          options={[
            { value: "secret", label: "保密" },
            { value: "male", label: "男" },
            { value: "female", label: "女" },
          ]}
        />
      </Field>
      <Field label="简介" error={errors.bio}>
        <Textarea rows={3} placeholder="介绍一下自己..." value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      </Field>
      <div className="flex justify-end">
        <Button loading={save.isPending} onClick={submit}>
          {save.isPending ? "保存中..." : "保存"}
        </Button>
      </div>
    </Card>
  );
}

function deviceLabel(ua?: string | null) {
  if (!ua) return "未知设备";
  const r = UAParser(ua);
  return [r.browser.name && `${r.browser.name} ${r.browser.major ?? ""}`.trim(), r.os.name && `${r.os.name} ${r.os.version ?? ""}`.trim()].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

function SecuritySettings() {
  const { data: session } = useSession();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const r = await authClient.listSessions();
      if (r.error) throw new Error(r.error.message ?? "获取会话列表失败");
      return r.data;
    },
  });
  const navigate = useNavigate();
  const [revoking, setRevoking] = useState<string | null>(null);
  const revoke = async (token: string) => {
    setRevoking(token);
    const isCurrent = token === session?.session.token;
    const r = isCurrent ? await authClient.signOut() : await authClient.revokeSession({ token });
    setRevoking(null);
    if (r.error) return toast.error("撤销会话失败");
    if (isCurrent) {
      toast.success("已退出当前会话");
      return navigate("/login");
    }
    toast.success("会话已撤销");
    refetch();
  };
  return (
    <div className="flex flex-col gap-4">
      <ChangePassword />
      <Card className="p-5">
        <h2 className="text-sm font-semibold">活动会话</h2>
        <p className="mt-1 text-sm text-muted-foreground">以下是您账户的所有活动会话。点击「撤销」可结束指定会话。</p>
        <div className="mt-4">
          {isPending ? (
            <FullSpinner />
          ) : isError ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              会话列表加载失败，请重试{" "}
              <Button size="xs" variant="outline" onClick={() => refetch()}>
                重试
              </Button>
            </div>
          ) : !data?.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无活动会话</div>
          ) : (
            <Table className="rounded-xl">
              <thead>
                <tr>
                  <th>设备 / 浏览器</th>
                  <th>地址</th>
                  <th>登录时间</th>
                  <th>过期时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {deviceLabel(s.userAgent)} {s.token === session?.session.token && <Badge variant="success">当前</Badge>}
                    </td>
                    <td>{s.ipAddress || "-"}</td>
                    <td className="whitespace-nowrap">{formatTime(String(s.createdAt))}</td>
                    <td className="whitespace-nowrap">{formatTime(String(s.expiresAt))}</td>
                    <td className="text-right">
                      <Button size="xs" variant="outline" loading={revoking === s.token} onClick={() => revoke(s.token)}>
                        {revoking === s.token ? "撤销中..." : "撤销"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.current) return toast.error("请输入当前密码");
    if (form.next.length < 8) return toast.error("新密码至少 8 位");
    if (form.next !== form.confirm) return toast.error("两次输入的密码不一致");
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: form.current, newPassword: form.next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return toast.error(error.message === "Invalid password" ? "当前密码错误" : `修改失败：${error.message ?? ""}`);
    toast.success("密码已修改，其他设备已退出登录");
    setForm({ current: "", next: "", confirm: "" });
  };
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-sm font-semibold">修改密码</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="当前密码">
          <PasswordInput value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </Field>
        <Field label="新密码">
          <PasswordInput value={form.next} placeholder="至少 8 位" onChange={(e) => setForm({ ...form, next: e.target.value })} />
        </Field>
        <Field label="确认新密码">
          <PasswordInput value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button loading={busy} onClick={submit}>
          修改密码
        </Button>
      </div>
    </Card>
  );
}

function SubscriptionSettings() {
  const trpc = useTRPC();
  const { data, isPending, isError, refetch } = useQuery(trpc.price.mySubscription.queryOptions());
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">订阅</h2>
      {isPending ? (
        <div className="py-6 text-center text-sm text-muted-foreground">加载中...</div>
      ) : isError ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          订阅信息加载失败，请重试{" "}
          <Button size="xs" variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      ) : data ? (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">当前方案</dt>
          <dd>
            {data.planName} <Badge variant="success">已订阅</Badge>
          </dd>
          <dt className="text-muted-foreground">支付时间</dt>
          <dd>{formatTime(data.paidAt)}</dd>
          <dt className="text-muted-foreground">到期时间</dt>
          <dd>{data.expiresAt ? formatTime(data.expiresAt) : "永久有效"}</dd>
        </dl>
      ) : (
        <div className="flex flex-col items-start gap-3 py-4">
          <div className="text-sm">
            尚未订阅 <span className="text-muted-foreground">· 订阅后可解锁全部 PRO 功能。</span>
          </div>
          <Link to="/pricing">
            <Button>前往订阅</Button>
          </Link>
        </div>
      )}
    </Card>
  );
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const remove = async () => {
    setBusy(true);
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error) return toast.error(`删除失败：${error.message ?? "未知错误"}`);
    toast.success("账号已删除");
    navigate("/");
  };
  return (
    <Card className="border-destructive/30 p-5">
      <h2 className="text-sm font-semibold text-destructive-foreground">删除账户</h2>
      <p className="mt-1 text-sm text-muted-foreground">删除账户将永久清除您的所有数据</p>
      <Button className="mt-4" variant="destructive" onClick={() => setOpen(true)}>
        删除账户
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        title="确认删除账户？"
        description="此操作不可恢复，将永久删除你的账号和所有相关数据。"
        destructive
        confirmText={busy ? "删除中..." : "确认删除"}
        loading={busy}
        onConfirm={remove}
      >
        <div className="mt-4">
          <Field label="输入密码确认">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </AlertDialog>
    </Card>
  );
}
