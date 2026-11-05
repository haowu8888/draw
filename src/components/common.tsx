import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, Shield, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { AlertDialog, Avatar, Button, Dialog, Input, Menu, MenuItem, MenuLabel, MenuSeparator, Spinner } from "@/components/ui";
import { authClient, useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export function Logo({ className, to = "/" }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <img src="/favicon.svg" alt="" className="size-6" />
      <span className="text-[15px]">Draw</span>
    </Link>
  );
}

export function FullSpinner() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Spinner className="size-5" />
    </div>
  );
}

/** Redirects to /login when there is no session; returns the session once loaded. */
export function useRequireAuth(role?: "admin") {
  const { data, isPending } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (isPending) return;
    if (!data) navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    else if (role === "admin" && data.user.role !== "admin") navigate("/403", { replace: true });
  }, [data, isPending, navigate, location, role]);
  return { session: data, ready: !isPending && !!data && (role !== "admin" || data.user.role === "admin") };
}

export function UserAvatarMenu({ admin }: { admin?: boolean }) {
  const { data } = useSession();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const user = data.user;
  const logout = async () => {
    setBusy(true);
    const { error } = await authClient.signOut();
    setBusy(false);
    if (error) return toast.error(`退出登录失败: ${error.message ?? "请重试"}`);
    setConfirm(false);
    navigate("/login");
  };
  return (
    <>
      <Menu
        align="end"
        className="w-56"
        trigger={
          <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={admin ? "后台账户菜单" : "账户菜单"}>
            <Avatar name={user.name} src={user.image} className="size-8" />
          </button>
        }
      >
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar name={user.name} src={user.image} className="size-8" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <MenuSeparator />
        {admin && <MenuLabel>{user.role === "admin" ? "管理员" : "普通用户"}</MenuLabel>}
        <MenuItem onClick={() => navigate("/user/dashboard")}>
          <UserRound />
          个人中心
        </MenuItem>
        {user.role === "admin" && !admin && (
          <MenuItem onClick={() => navigate("/dashboard")}>
            <Shield />
            后台管理
          </MenuItem>
        )}
        {admin && (
          <MenuItem onClick={() => navigate("/dashboard")}>
            <LayoutDashboard />
            后台首页
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem onClick={() => setConfirm(true)}>
          <LogOut />
          退出登录
        </MenuItem>
      </Menu>
      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="确认退出登录？"
        description="退出登录后，您需要重新登录才能继续使用。"
        confirmText={busy ? "退出中..." : "退出登录"}
        loading={busy}
        onConfirm={logout}
      />
    </>
  );
}

export function Announcement() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.setting.get.queryOptions());
  const [hidden, setHidden] = useState(() => sessionStorage.getItem("announcement-hidden") === data?.announcement);
  if (!data?.announcement || hidden) return null;
  return (
    <div className="relative flex items-center justify-center bg-neutral-900 px-10 py-2 text-center text-sm text-white">
      <span className="whitespace-pre-wrap">{data.announcement}</span>
      <button
        className="absolute right-3 rounded p-1 opacity-70 hover:opacity-100"
        aria-label="关闭"
        onClick={() => {
          sessionStorage.setItem("announcement-hidden", data.announcement);
          setHidden(true);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Generic "enter a name" dialog used for rename / new folder etc. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial = "",
  placeholder,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (name: string) => Promise<unknown> | void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(initial);
      setError(null);
    }
  }, [open, initial]);
  const submit = async () => {
    const v = value.trim();
    if (!v) return setError("请输入名称");
    if (v.length > 128) return setError("名称不能超过 128 个字符");
    setBusy(true);
    try {
      await onSubmit(v);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button loading={busy} onClick={submit}>
            确定
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
        aria-invalid={!!error}
      />
      {error && <p className="mt-1.5 text-xs text-destructive-foreground">{error}</p>}
    </Dialog>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        下一页
      </Button>
    </div>
  );
}
