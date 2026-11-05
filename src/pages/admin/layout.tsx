import { ClipboardList, LayoutDashboard, ListTodo, Menu as MenuIcon, Settings, Users, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { FullSpinner, Logo, UserAvatarMenu, useRequireAuth } from "@/components/common";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard, end: true },
  { to: "/dashboard/users", label: "用户管理", icon: Users },
  { to: "/dashboard/orders", label: "订单管理", icon: ClipboardList },
  { to: "/dashboard/tasks", label: "任务队列", icon: ListTodo },
  { to: "/dashboard/settings", label: "系统设置", icon: Settings },
];

export default function AdminLayout() {
  const { ready } = useRequireAuth("admin");
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
  return (
    <div className="flex min-h-full bg-admin-bg">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-admin-divider bg-admin-card px-3 py-3 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-10 items-center justify-between px-2">
          <Logo to="/dashboard" />
          <button className="md:hidden" aria-label="关闭后台菜单" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </button>
        </div>
        <nav className="mt-4 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn("flex h-8 items-center gap-2 rounded-md px-2 text-sm text-neutral-600 hover:bg-admin-hover dark:text-neutral-300", isActive && "bg-admin-hover font-medium text-foreground")
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-admin-divider bg-admin-bg/80 px-4 backdrop-blur">
          <button className="md:hidden" aria-label="打开后台菜单" onClick={() => setOpen(true)}>
            <MenuIcon className="size-4" />
          </button>
          <span className="text-sm font-medium">{current?.label}</span>
          <div className="ml-auto">
            <UserAvatarMenu admin />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{ready ? <Outlet /> : <FullSpinner />}</main>
      </div>
    </div>
  );
}
