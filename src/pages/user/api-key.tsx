import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FullSpinner } from "@/components/common";
import { AlertDialog, Badge, Button, Dialog, Empty, Field, Input, Select, Switch, Table } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { copyText, errorMessage, formatTime } from "@/lib/utils";

const EXPIRY = [
  { value: "7", label: "7 天" },
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "365", label: "1 年" },
  { value: "never", label: "永不过期" },
];

export default function UserApiKey() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data, isPending, refetch, isFetching } = useQuery(trpc.apiKey.list.queryOptions());
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.apiKey.list.queryKey() });
  const update = useMutation(trpc.apiKey.update.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e, "更新启用状态失败")) }));
  const remove = useMutation(trpc.apiKey.remove.mutationOptions({ onSuccess: refresh }));
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          通过 API Key 调用开放接口（<code className="rounded bg-muted px-1">/api/v1</code>）读取和编辑你的画布。
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} loading={isFetching && !isPending}>
            {!(isFetching && !isPending) && <RefreshCw />}
            刷新
          </Button>
          <Button onClick={() => setEditing({ name: "" })}>
            <Plus />
            创建 API Key
          </Button>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>名称</th>
            <th>状态</th>
            <th>过期时间</th>
            <th>最后使用</th>
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
          ) : !data?.length ? (
            <tr>
              <td colSpan={6}>
                <Empty icon={<KeyRound />} title="暂无 API Key" />
              </td>
            </tr>
          ) : (
            data.map((k) => {
              const expired = k.expiresAt && Date.parse(k.expiresAt) < Date.now();
              return (
                <tr key={k.id}>
                  <td>
                    <div className="font-medium">{k.name || "未命名"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{k.start}••••••••</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Switch checked={k.enabled} onCheckedChange={(enabled) => update.mutate({ id: k.id, enabled })} />
                      {expired ? <Badge variant="destructive">已过期</Badge> : k.enabled ? <Badge variant="success">已启用</Badge> : <Badge>已禁用</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{k.expiresAt ? formatTime(k.expiresAt) : "永不过期"}</td>
                  <td className="whitespace-nowrap">{formatTime(k.lastUsedAt)}</td>
                  <td className="whitespace-nowrap">{formatTime(k.createdAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="icon-sm" variant="ghost" aria-label={`编辑 ${k.name}`} onClick={() => setEditing({ id: k.id, name: k.name })}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`删除 ${k.name}`} onClick={() => setDeleting(k)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      <OperateApiKey value={editing} onClose={() => setEditing(null)} onDone={refresh} />
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="确认删除"
        description={`你确定要删除 API Key「${deleting?.name}」吗？此操作无法撤销，使用此密钥的应用将无法继续访问 API。`}
        destructive
        confirmText={remove.isPending ? "删除中..." : "删除"}
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ id: deleting!.id });
            toast.success("删除成功");
            setDeleting(null);
          } catch (e) {
            toast.error(errorMessage(e, "删除失败"));
          }
        }}
      />
    </div>
  );
}

function OperateApiKey({ value, onClose, onDone }: { value: { id?: string; name: string } | null; onClose: () => void; onDone: () => void }) {
  const trpc = useTRPC();
  const create = useMutation(trpc.apiKey.create.mutationOptions());
  const update = useMutation(trpc.apiKey.update.mutationOptions());
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const editing = !!value?.id;
  const [lastOpen, setLastOpen] = useState<typeof value>(null);
  if (value !== lastOpen) {
    setLastOpen(value);
    setName(value?.name ?? "");
    setExpiry("never");
    setError(null);
    setCreated(null);
  }

  const submit = async () => {
    if (!name.trim()) return setError("请输入名称");
    if (name.length > 100) return setError("名称长度不能超过100字符");
    try {
      if (editing) {
        await update.mutateAsync({ id: value!.id!, name: name.trim() });
        toast.success("更新成功");
        onDone();
        onClose();
      } else {
        const r = await create.mutateAsync({ name: name.trim(), expiresInDays: expiry === "never" ? null : Number(expiry) });
        setCreated(r.key);
        toast.success("创建成功");
        onDone();
      }
    } catch (e) {
      toast.error(errorMessage(e, editing ? "更新失败" : "创建失败"));
    }
  };

  if (created) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title="复制 API Key" description="请妥善保管你的 API Key，它只会显示一次：" footer={<Button onClick={onClose}>完成</Button>}>
        <div className="flex gap-2">
          <Input readOnly value={created} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button variant="outline" size="icon" aria-label="复制" onClick={() => copyText(created).then((ok) => (ok ? toast.success("已复制到剪贴板") : toast.error("复制失败")))}>
            <Copy />
          </Button>
        </div>
        <p className="mt-3 text-xs text-warning-foreground">警告：关闭此对话框后将无法再次查看完整密钥</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "编辑 API Key" : "创建 API Key"}
      description={editing ? "修改 API Key 的名称" : "创建一个新的 API 密钥用于访问 API"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button loading={create.isPending || update.isPending} onClick={submit}>
            {editing ? (update.isPending ? "保存中..." : "保存") : create.isPending ? "创建中..." : "创建"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="名称" error={error}>
          <Input autoFocus placeholder="例如：生产环境 API Key" value={name} onChange={(e) => (setName(e.target.value), setError(null))} />
        </Field>
        {!editing && (
          <Field label="过期时间">
            <Select value={expiry} onValueChange={setExpiry} options={EXPIRY} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
