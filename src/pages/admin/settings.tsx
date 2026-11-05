import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CloudUpload, Copy, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FullSpinner } from "@/components/common";
import { AlertDialog, Badge, Button, Card, Checkbox, Dialog, Empty, Field, Input, Label, SegmentTabs, Select, Spinner, Switch, Table, Textarea } from "@/components/ui";
import { useTRPC } from "@/lib/trpc";
import { copyText, errorMessage } from "@/lib/utils";

type Tab = "basic" | "stacks" | "libraries" | "fonts";

export default function AdminSettings() {
  const [tab, setTab] = useState<Tab>("basic");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">系统设置</h1>
        <p className="text-sm text-muted-foreground">管理站点公告、代码展示技术方案等系统级配置</p>
      </div>
      <SegmentTabs
        className="self-start"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "basic", label: "基础设置" },
          { value: "stacks", label: "技术方案" },
          { value: "libraries", label: "资源库" },
          { value: "fonts", label: "字体" },
        ]}
      />
      {tab === "basic" && <BasicSettings />}
      {tab === "stacks" && <StacksSettings />}
      {tab === "libraries" && <LibrarySettings />}
      {tab === "fonts" && <FontSettings />}
    </div>
  );
}

function BasicSettings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(trpc.setting.get.queryOptions());
  const save = useMutation(trpc.setting.update.mutationOptions());
  const [value, setValue] = useState("");
  useEffect(() => setValue(data?.announcement ?? ""), [data]);
  if (isPending) return <FullSpinner />;
  if (isError)
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        设置加载失败，请重试{" "}
        <Button size="xs" variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </Card>
    );
  return (
    <Card className="flex flex-col gap-3 rounded-xl border-admin-divider p-5 shadow-none">
      <Field label="站点公告" hint="将展示给所有访客；支持纯文本，留空则隐藏公告区。">
        <Textarea rows={4} value={value} placeholder="留空表示不显示公告" onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ announcement: value });
              qc.setQueryData(trpc.setting.get.queryKey(), (d) => (d ? { ...d, announcement: value.trim() } : d));
              toast.success("保存成功");
            } catch (e) {
              toast.error(errorMessage(e, "保存失败"));
            }
          }}
        >
          保存
        </Button>
      </div>
    </Card>
  );
}

// ---------------- stacks ----------------

type StackRow = { id: string; key: string; name: string; description: string | null; runtime: "html" | "react" | "vue"; libraryIds: string[]; starter: string | null; prompt: string | null; enabled: boolean; sort: number };
const RUNTIMES = [
  { value: "html" as const, label: "HTML", description: "一段 HTML 页面片段，可写内联 <script>" },
  { value: "react" as const, label: "React", description: "一个函数组件（可用 JSX 与 TypeScript）" },
  { value: "vue" as const, label: "Vue 3", description: "单文件组件：<template> + <script> + <style>" },
];

function StacksSettings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: stacks, isPending } = useQuery(trpc.codeStack.stacks.queryOptions());
  const { data: libs } = useQuery(trpc.codeStack.libraries.queryOptions());
  const refresh = () => {
    qc.invalidateQueries({ queryKey: trpc.codeStack.pathKey() });
  };
  const save = useMutation(trpc.codeStack.saveStack.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.codeStack.deleteStack.mutationOptions({ onSuccess: refresh }));
  const seed = useMutation(trpc.codeStack.seedDefaults.mutationOptions({ onSuccess: refresh }));
  const [editing, setEditing] = useState<Partial<StackRow> | null>(null);
  const [deleting, setDeleting] = useState<StackRow | null>(null);

  const move = async (i: number, d: number) => {
    if (!stacks) return;
    const list = [...stacks];
    const [s] = list.splice(i, 1);
    list.splice(i + d, 0, s);
    await Promise.all(list.map((x, idx) => save.mutateAsync({ ...x, description: x.description ?? undefined, starter: x.starter ?? undefined, prompt: x.prompt ?? undefined, sort: idx })));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">画布「插入 → 代码展示」可选的方案，节点在隔离沙箱中运行，只能使用方案内的资源。</p>
        <div className="flex gap-2">
          <Button variant="outline" loading={seed.isPending} onClick={() => seed.mutateAsync().then((n) => toast.success(n ? `已导入 ${n} 项` : "预置资源与方案都已存在，无需导入"))}>
            <Download />
            导入预置方案
          </Button>
          <Button onClick={() => setEditing({ runtime: "html", libraryIds: [], enabled: true })}>
            <Plus />
            新增方案
          </Button>
        </div>
      </div>
      {isPending ? (
        <FullSpinner />
      ) : !stacks?.length ? (
        <Card className="rounded-xl shadow-none">
          <Empty title="还没有技术方案" description="导入预置：HTML、Vue 3 + Element Plus、React + Ant Design（均内置 Tailwind CSS）" />
        </Card>
      ) : (
        <Table className="rounded-xl">
          <thead>
            <tr>
              <th>名称</th>
              <th>运行方式</th>
              <th>资源</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {stacks.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </td>
                <td>{RUNTIMES.find((r) => r.value === s.runtime)?.label}</td>
                <td className="max-w-64 text-xs text-muted-foreground">
                  {s.libraryIds.map((id) => libs?.find((l) => l.id === id)?.name ?? "已删除的资源").join("、") || "无"}
                </td>
                <td>{s.enabled ? <Badge variant="success">启用</Badge> : <Badge>已停用</Badge>}</td>
                <td className="text-right whitespace-nowrap">
                  <Button size="icon-sm" variant="ghost" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="下移" disabled={i === stacks.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`编辑 ${s.name}`} onClick={() => setEditing(s)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`删除 ${s.name}`} onClick={() => setDeleting(s)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <StackDialog value={editing} libs={libs ?? []} onClose={() => setEditing(null)} onSave={(v) => save.mutateAsync(v).then(() => (toast.success("已保存"), setEditing(null)))} />}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`删除「${deleting?.name}」？`}
        description="已使用该方案的代码展示节点会显示「方案不可用」，代码仍保留。"
        destructive
        confirmText="删除"
        loading={remove.isPending}
        onConfirm={() => remove.mutateAsync({ id: deleting!.id }).then(() => (setDeleting(null), toast.success("已删除")))}
      />
    </div>
  );
}

type Lib = { id: string; name: string; category: string; packageName: string | null; version: string | null; globalName: string | null; modules: string | null; files: { url: string; type: "js" | "css"; source?: string }[]; builtin: boolean; enabled: boolean; mirrored: boolean };

function StackDialog({ value, libs, onClose, onSave }: { value: Partial<StackRow>; libs: Lib[]; onClose: () => void; onSave: (v: Omit<StackRow, "id" | "key" | "sort" | "description" | "starter" | "prompt"> & { id?: string; description?: string; starter?: string; prompt?: string }) => Promise<unknown> }) {
  const [form, setForm] = useState({
    name: value.name ?? "",
    description: value.description ?? "",
    runtime: value.runtime ?? "html",
    libraryIds: value.libraryIds ?? [],
    starter: value.starter ?? "",
    prompt: value.prompt ?? "",
    enabled: value.enabled ?? true,
  });
  const [busy, setBusy] = useState(false);
  const builtin = libs.filter((l) => l.builtin);
  const available = libs.filter((l) => !l.builtin && !form.libraryIds.includes(l.id) && l.enabled);
  const submit = async () => {
    if (!form.name.trim()) return toast.error("请输入名称");
    setBusy(true);
    try {
      await onSave({ id: value.id, ...form, name: form.name.trim() });
    } catch (e) {
      toast.error(errorMessage(e, "保存失败"));
    } finally {
      setBusy(false);
    }
  };
  const moveLib = (i: number, d: number) => {
    const ids = [...form.libraryIds];
    const [x] = ids.splice(i, 1);
    ids.splice(i + d, 0, x);
    setForm({ ...form, libraryIds: ids });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? "编辑技术方案" : "新增技术方案"}
      description="用户新建代码展示节点时选择方案，只能使用方案内的资源，不能自行引入脚本。"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button loading={busy} onClick={submit}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称">
            <Input value={form.name} placeholder="如 React 19 + Ant Design" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="运行方式">
            <Select value={form.runtime} onValueChange={(runtime) => setForm({ ...form, runtime })} options={RUNTIMES} />
          </Field>
        </div>
        <Field label="描述" hint="显示在插入面板中">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div>
          <Label>资源（按顺序加载，被依赖的放前面）</Label>
          {builtin.length > 0 && <p className="mt-1 text-xs text-muted-foreground">内置资源自动加载，无需添加：{builtin.map((l) => l.name).join("、")}</p>}
          <div className="mt-2 flex flex-col gap-1.5">
            {form.libraryIds.length === 0 && <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">还没有添加资源</div>}
            {form.libraryIds.map((id, i) => {
              const lib = libs.find((l) => l.id === id);
              return (
                <div key={id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  <span className="flex-1">
                    {lib ? `${lib.name} ${lib.version ?? ""}` : "已删除的资源"}
                    {lib?.globalName && <span className="ml-2 font-mono text-xs text-muted-foreground">{lib.globalName}</span>}
                  </span>
                  <Button size="icon-xs" variant="ghost" aria-label="上移" disabled={i === 0} onClick={() => moveLib(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="下移" disabled={i === form.libraryIds.length - 1} onClick={() => moveLib(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="移除" onClick={() => setForm({ ...form, libraryIds: form.libraryIds.filter((x) => x !== id) })}>
                    <X />
                  </Button>
                </div>
              );
            })}
            {available.length > 0 ? (
              <Select
                value={null}
                placeholder="添加资源…"
                onValueChange={(id) => setForm({ ...form, libraryIds: [...form.libraryIds, id] })}
                options={available.map((l) => ({ value: l.id, label: `${l.name} ${l.version ?? ""}` }))}
              />
            ) : (
              <p className="text-xs text-muted-foreground">没有可添加的资源</p>
            )}
          </div>
        </div>
        <Field label="起步代码">
          <Textarea rows={6} className="font-mono text-xs" value={form.starter} onChange={(e) => setForm({ ...form, starter: e.target.value })} />
        </Field>
        <Field label="提示词（可选）" hint="留空使用默认提示词（自动列出可用库、可 import 的模块、代码格式与沙箱限制）；填写后替代默认提示词，适合需要强调特定库写法的方案。节点当前代码和用户填写的需求仍会附在末尾。">
          <Textarea rows={4} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
          启用（停用后不能新建，已有节点显示「方案不可用」）
        </label>
      </div>
    </Dialog>
  );
}

// ---------------- libraries ----------------

const LIB_CATEGORIES = [
  { value: "framework", label: "前端框架" },
  { value: "ui", label: "UI 组件库" },
  { value: "chart", label: "图表" },
  { value: "icon", label: "图标" },
  { value: "css", label: "样式" },
  { value: "util", label: "工具类" },
  { value: "other", label: "其他" },
];

function LibrarySettings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: libs, isPending } = useQuery(trpc.codeStack.libraries.queryOptions());
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.codeStack.pathKey() });
  const remove = useMutation(trpc.codeStack.deleteLibrary.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e, "删除失败")) }));
  const mirror = useMutation(trpc.codeStack.mirrorLibrary.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e, "转存失败")) }));
  const [editing, setEditing] = useState<Partial<Lib> | null>(null);
  const [deleting, setDeleting] = useState<Lib | null>(null);
  const [cat, setCat] = useState("all");
  const list = (libs ?? []).filter((l) => cat === "all" || l.category === cat);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">框架 / UI 库按包分组，每个包可添加多个版本，在技术方案中选择使用哪个版本。转存到对象存储后不依赖公共 CDN。</p>
        <div className="flex gap-2">
          <Select className="w-32" value={cat} onValueChange={setCat} options={[{ value: "all", label: "全部分类" }, ...LIB_CATEGORIES]} />
          <Button onClick={() => setEditing({ category: "other", files: [], enabled: true, builtin: false })}>
            <Plus />
            新增资源
          </Button>
        </div>
      </div>
      {isPending ? (
        <FullSpinner />
      ) : !list.length ? (
        <Card className="rounded-xl shadow-none">
          <Empty title="这个分类下还没有资源" />
        </Card>
      ) : (
        <Table className="rounded-xl">
          <thead>
            <tr>
              <th>名称</th>
              <th>包 / 版本</th>
              <th>全局变量 / 模块</th>
              <th>文件</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id}>
                <td>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{LIB_CATEGORIES.find((c) => c.value === l.category)?.label}</div>
                </td>
                <td className="font-mono text-xs">
                  {l.packageName ?? "-"}
                  {l.version && `@${l.version}`}
                </td>
                <td className="font-mono text-xs">
                  {l.globalName ?? "-"}
                  {l.modules && <div className="text-muted-foreground">{l.modules}</div>}
                </td>
                <td className="text-xs">{l.files.length} 个文件</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {l.builtin && <Badge variant="info">内置</Badge>}
                    {l.enabled ? <Badge variant="success">启用</Badge> : <Badge>已停用</Badge>}
                    {l.mirrored ? <Badge variant="outline">已转存</Badge> : <Badge variant="warning">未转存</Badge>}
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">
                  <Button size="icon-sm" variant="ghost" aria-label="转存到 S3" title="转存到对象存储" loading={mirror.isPending && mirror.variables?.id === l.id} onClick={() => mirror.mutateAsync({ id: l.id }).then(() => toast.success("已转存到对象存储"))}>
                    {!(mirror.isPending && mirror.variables?.id === l.id) && <CloudUpload />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`编辑 ${l.name}`} onClick={() => setEditing(l)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`删除 ${l.name}`} onClick={() => setDeleting(l)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <LibraryDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`删除「${deleting?.name}」？`}
        description="同时删除已转存到对象存储的文件。被技术方案使用中的版本不能删除。"
        destructive
        confirmText="删除"
        loading={remove.isPending}
        onConfirm={() => remove.mutateAsync({ id: deleting!.id }).then(() => (setDeleting(null), toast.success("已删除")))}
      />
    </div>
  );
}

function LibraryDialog({ value, onClose, onSaved }: { value: Partial<Lib>; onClose: () => void; onSaved: () => void }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const save = useMutation(trpc.codeStack.saveLibrary.mutationOptions());
  const [form, setForm] = useState({
    name: value.name ?? "",
    category: value.category ?? "other",
    packageName: value.packageName ?? "",
    version: value.version ?? "",
    globalName: value.globalName ?? "",
    modules: value.modules ?? "",
    files: (value.files ?? []).map((f) => f.source ?? f.url).join("\n"),
    builtin: value.builtin ?? false,
    enabled: value.enabled ?? true,
    mirror: false,
  });
  const [mode, setMode] = useState<"npm" | "url">(value.id ? "url" : "npm");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({ ...trpc.codeStack.cdnSearch.queryOptions({ q: debounced }), enabled: mode === "npm" && !!debounced });
  const versions = useQuery({ ...trpc.codeStack.cdnVersions.queryOptions({ name: form.packageName }), enabled: mode === "npm" && !!form.packageName });
  const files = useQuery({ ...trpc.codeStack.cdnFiles.queryOptions({ name: form.packageName, version: form.version }), enabled: mode === "npm" && !!form.packageName && !!form.version });
  const [filter, setFilter] = useState("");
  const selected = form.files.split("\n").map((s) => s.trim()).filter(Boolean);
  const toggleFile = async (url: string) => {
    const next = selected.includes(url) ? selected.filter((u) => u !== url) : [...selected, url];
    setForm((f) => ({ ...f, files: next.join("\n") }));
    if (!selected.includes(url) && url.endsWith(".js") && !form.globalName) {
      try {
        const r = await client.fetchQuery(trpc.codeStack.inspectScript.queryOptions({ url }));
        if (r.globalName) setForm((f) => ({ ...f, globalName: f.globalName || r.globalName! }));
        else toast.info("未能识别，请手动填写全局变量");
      } catch {
        /* ignore */
      }
    }
  };
  const submit = async () => {
    if (!form.name.trim()) return toast.error("请输入名称");
    if (!selected.length) return toast.error("至少选择一个文件");
    try {
      await save.mutateAsync({
        id: value.id,
        name: form.name.trim(),
        category: form.category,
        packageName: form.packageName || null,
        version: form.version || null,
        globalName: form.globalName || null,
        modules: form.modules || null,
        files: selected.map((url) => ({ url, type: url.split("?")[0].endsWith(".css") ? ("css" as const) : ("js" as const) })),
        builtin: form.builtin,
        enabled: form.enabled,
        mirror: form.mirror,
      });
      toast.success(form.mirror ? "已保存并转存到对象存储" : "已保存");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "保存失败"));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? `编辑 ${value.name}` : "新增资源"}
      description="只支持挂到全局变量的 UMD / IIFE 单文件（如 vue.global.prod.js、antd.min.js），不支持 ESM。"
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <SegmentTabs
          value={mode}
          onValueChange={setMode}
          items={[
            { value: "npm", label: "搜索 npm" },
            { value: "url", label: "自定义地址" },
          ]}
        />
        {mode === "npm" && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Input placeholder="搜索 npm 包，如 vue、antd、element-plus" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                {search.isFetching ? (
                  <div className="flex justify-center p-4">
                    <Spinner />
                  </div>
                ) : (
                  search.data?.map((p) => (
                    <button
                      key={p.name}
                      className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
                      onClick={() => setForm((f) => ({ ...f, packageName: p.name, version: p.version, name: f.name || p.name, files: "", globalName: "" }))}
                    >
                      <div className="font-mono text-xs font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                    </button>
                  )) ?? <div className="p-4 text-center text-xs text-muted-foreground">选择包和版本后显示文件</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Select
                value={form.version || null}
                placeholder="选择版本"
                onValueChange={(version) => setForm({ ...form, version, files: "" })}
                options={(versions.data?.versions ?? []).map((v) => ({ value: v, label: v === versions.data?.latest ? `${v}（最新）` : v }))}
              />
              <Input placeholder="筛选文件" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="max-h-40 overflow-y-auto rounded-lg border">
                {files.isFetching ? (
                  <div className="flex justify-center p-4">
                    <Spinner />
                  </div>
                ) : (
                  files.data
                    ?.filter((f) => !filter || f.path.includes(filter))
                    .slice(0, 200)
                    .map((f) => (
                      <label key={f.path} className="flex items-center gap-2 border-b px-3 py-1.5 font-mono text-xs last:border-0 hover:bg-accent">
                        <Checkbox checked={selected.includes(f.url)} onCheckedChange={() => toggleFile(f.url)} />
                        <span className="flex-1 truncate">{f.path}</span>
                        <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)}K</span>
                      </label>
                    )) ?? <div className="p-4 text-center text-xs text-muted-foreground">选择包和版本后显示文件</div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="分类">
            <Select value={form.category} onValueChange={(category) => setForm({ ...form, category })} options={LIB_CATEGORIES} />
          </Field>
          <Field label="包名">
            <Input value={form.packageName} placeholder="如 react" onChange={(e) => setForm({ ...form, packageName: e.target.value })} />
          </Field>
          <Field label="版本">
            <Input value={form.version} placeholder="如 19.3.0" onChange={(e) => setForm({ ...form, version: e.target.value })} />
          </Field>
          <Field label="全局变量" hint="如 React、antd；纯样式可留空">
            <Input value={form.globalName} onChange={(e) => setForm({ ...form, globalName: e.target.value })} />
          </Field>
          <Field label="可 import 的模块名" hint="逗号分隔，如 react-dom, react-dom/client">
            <Input value={form.modules} onChange={(e) => setForm({ ...form, modules: e.target.value })} />
          </Field>
        </div>
        <Field label="文件地址（每行一个，按顺序加载；.css 结尾为样式）">
          <Textarea rows={3} className="font-mono text-xs" value={form.files} onChange={(e) => setForm({ ...form, files: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
            启用 <span className="text-xs text-muted-foreground">停用后技术方案会跳过该资源</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={form.builtin} onCheckedChange={(builtin) => setForm({ ...form, builtin })} />
            内置到所有方案 <span className="text-xs text-muted-foreground">自动加载到每个技术方案（如 Tailwind CSS）</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.mirror} onCheckedChange={(mirror) => setForm({ ...form, mirror })} />
            保存时转存到 S3
          </label>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------- fonts ----------------

const FONT_CATEGORIES = [
  { value: "sans", label: "无衬线" },
  { value: "serif", label: "衬线" },
  { value: "mono", label: "等宽" },
  { value: "hand", label: "手写" },
  { value: "zh", label: "中文" },
];

type Font = { id: string; family: string; displayName: string | null; category: string; source: "url" | "upload"; url: string | null; css: string | null; files: { url: string; weight: string; style: string }[]; enabled: boolean; mirrored: boolean };

function FontSettings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: fonts, isPending } = useQuery(trpc.codeStack.fonts.queryOptions());
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.codeStack.pathKey() });
  const remove = useMutation(trpc.codeStack.deleteFont.mutationOptions({ onSuccess: refresh }));
  const mirror = useMutation(trpc.codeStack.mirrorFont.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e, "转存失败")) }));
  const [editing, setEditing] = useState<Partial<Font> | null>(null);
  const [deleting, setDeleting] = useState<Font | null>(null);
  const markdown = () => {
    const rows = (fonts ?? []).filter((f) => f.enabled && f.mirrored);
    const md = ["| 字体名称 | font-family | 分类 |", "| --- | --- | --- |", ...rows.map((f) => `| ${f.displayName || f.family} | '${f.family}' | ${FONT_CATEGORIES.find((c) => c.value === f.category)?.label} |`)].join("\n");
    copyText(md).then((ok) => (ok ? toast.success(`已复制 ${rows.length} 款字体`) : toast.error("复制失败，请手动选择下方 Markdown")));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">代码展示节点在沙箱中运行，加载不了 Google Fonts 等外部字体。这里的字体转存到对象存储后自动加载到所有技术方案，代码里直接写 font-family 原名。</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={markdown}>
            <Copy />
            给 AI 用
          </Button>
          <Button onClick={() => setEditing({ category: "sans", source: "url", enabled: true, files: [] })}>
            <Plus />
            新增字体
          </Button>
        </div>
      </div>
      {isPending ? (
        <FullSpinner />
      ) : !fonts?.length ? (
        <Card className="rounded-xl shadow-none">
          <Empty title="这个分类下还没有字体" />
        </Card>
      ) : (
        <Table className="rounded-xl">
          <thead>
            <tr>
              <th>字体</th>
              <th>预览</th>
              <th>来源</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {fonts.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="font-medium">{f.displayName || f.family}</div>
                  <div className="font-mono text-xs text-muted-foreground">{f.family}</div>
                </td>
                <td>
                  {f.css && <style>{f.css}</style>}
                  <span style={{ fontFamily: `'${f.family}'` }} className="text-base">
                    永和九年 你好世界 Draw 2026
                  </span>
                </td>
                <td className="text-xs">{f.source === "upload" ? "上传" : "在线地址"}</td>
                <td>
                  <div className="flex gap-1">
                    {f.enabled ? <Badge variant="success">启用</Badge> : <Badge>已停用</Badge>}
                    {f.mirrored ? <Badge variant="outline">已转存</Badge> : <Badge variant="warning">未转存</Badge>}
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">
                  {f.source === "url" && (
                    <Button size="icon-sm" variant="ghost" aria-label="重新转存" loading={mirror.isPending && mirror.variables?.id === f.id} onClick={() => mirror.mutateAsync({ id: f.id }).then((r) => toast.success(`已转存 · ${r.files} 个字体文件`))}>
                      {!(mirror.isPending && mirror.variables?.id === f.id) && <CloudUpload />}
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={`编辑 ${f.family}`} onClick={() => setEditing(f)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`删除字体 ${f.family}`} onClick={() => setDeleting(f)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <FontDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`删除字体 ${deleting?.family}？`}
        description="同时删除已转存到对象存储的文件，代码展示节点里用到它的文字会回退为系统字体。"
        destructive
        confirmText="删除"
        loading={remove.isPending}
        onConfirm={() => remove.mutateAsync({ id: deleting!.id }).then(() => (setDeleting(null), toast.success("已删除")))}
      />
    </div>
  );
}

function guessWeight(name: string) {
  const n = name.toLowerCase();
  const map: [RegExp, string][] = [[/thin|hairline/, "100"], [/extralight|ultralight/, "200"], [/light/, "300"], [/medium/, "500"], [/semibold|demibold/, "600"], [/extrabold|ultrabold/, "800"], [/black|heavy/, "900"], [/bold/, "700"]];
  return map.find(([r]) => r.test(n))?.[1] ?? "400";
}

function FontDialog({ value, onClose, onSaved }: { value: Partial<Font>; onClose: () => void; onSaved: () => void }) {
  const trpc = useTRPC();
  const save = useMutation(trpc.codeStack.saveFont.mutationOptions());
  const [form, setForm] = useState({
    family: value.family ?? "",
    displayName: value.displayName ?? "",
    category: value.category ?? "sans",
    source: value.source ?? "url",
    url: value.url ?? "",
    files: value.files ?? [],
    enabled: value.enabled ?? true,
    mirror: true,
  });
  const [uploading, setUploading] = useState(false);
  const upload = async (list: FileList) => {
    setUploading(true);
    const fd = new FormData();
    [...list].forEach((f) => fd.append("file", f));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setForm((f) => ({ ...f, files: [...f.files, ...(body as { name: string; url: string }[]).map((x) => ({ url: x.url, weight: guessWeight(x.name), style: /italic/i.test(x.name) ? "italic" : "normal" }))] }));
      toast.success("已上传");
    } catch (e) {
      toast.error(`上传失败（${(e as Error).message}）`);
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    if (!form.family.trim()) return toast.error("请输入字体名称");
    if (form.source === "url" && !/^https?:\/\//.test(form.url)) return toast.error("请输入在线地址");
    if (form.source === "upload" && !form.files.length) return toast.error("还没有字体文件");
    try {
      await save.mutateAsync({ id: value.id, ...form, family: form.family.trim(), displayName: form.displayName || null });
      toast.success(form.source === "url" && form.mirror ? "已保存并转存到对象存储" : "已保存");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "保存失败"));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? `编辑 ${value.family}` : "新增字体"}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="字体名称（font-family）">
            <Input value={form.family} placeholder="如 IBM Plex Sans、Noto Sans SC" onChange={(e) => setForm({ ...form, family: e.target.value })} />
          </Field>
          <Field label="显示名称（可选）">
            <Input value={form.displayName} placeholder="如 霞鹜文楷" onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Field>
          <Field label="分类">
            <Select value={form.category} onValueChange={(category) => setForm({ ...form, category })} options={FONT_CATEGORIES} />
          </Field>
          <Field label="来源">
            <Select
              value={form.source}
              onValueChange={(source) => setForm({ ...form, source })}
              options={[
                { value: "url", label: "在线地址" },
                { value: "upload", label: "上传文件" },
              ]}
            />
          </Field>
        </div>
        {form.source === "url" ? (
          <Field label="地址" hint="在线地址填 CSS（一般是 Google Fonts 的 css2 地址），转存时连同其中的字体文件存到对象存储。到 fonts.google.com 选好后复制 embed 地址最准确。">
            <Input value={form.url} placeholder="https://fonts.googleapis.com/css2?family=..." onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </Field>
        ) : (
          <div>
            <Label>字体文件（每个字重 / 斜体一个文件）</Label>
            <p className="mt-1 text-xs text-muted-foreground">只支持 ttf / otf / woff / woff2，单个不超过 20MB；字重按文件名猜测（Bold → 700 等），可修改</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {form.files.map((f, i) => (
                <div key={f.url} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
                  <span className="flex-1 truncate font-mono">{f.url.split("/").pop()}</span>
                  <Input className="h-7 w-20 text-xs" value={f.weight} onChange={(e) => setForm({ ...form, files: form.files.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })} />
                  <Select
                    size="sm"
                    className="w-24"
                    value={f.style}
                    onValueChange={(style) => setForm({ ...form, files: form.files.map((x, j) => (j === i ? { ...x, style } : x)) })}
                    options={[
                      { value: "normal", label: "常规" },
                      { value: "italic", label: "斜体" },
                    ]}
                  />
                  <Button size="icon-xs" variant="ghost" aria-label="移除" onClick={() => setForm({ ...form, files: form.files.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-accent">
                {uploading ? <Spinner /> : <CloudUpload className="size-4" />}
                选择文件
                <input type="file" multiple accept=".ttf,.otf,.woff,.woff2" className="hidden" disabled={uploading} onChange={(e) => e.target.files && upload(e.target.files)} />
              </label>
            </div>
          </div>
        )}
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
            启用
          </label>
          {form.source === "url" && (
            <label className="flex items-center gap-2">
              <Checkbox checked={form.mirror} onCheckedChange={(mirror) => setForm({ ...form, mirror })} />
              保存时转存到 S3
            </label>
          )}
        </div>
      </div>
    </Dialog>
  );
}
