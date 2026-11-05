import { KeyRound, LayoutGrid, PenTool, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { Announcement, FullSpinner, Logo, UserAvatarMenu, useRequireAuth } from "@/components/common";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/user/dashboard", label: "仪表盘", icon: LayoutGrid },
  { to: "/user/boards", label: "画布", icon: PenTool },
  { to: "/user/api-key", label: "API Key", icon: KeyRound },
  { to: "/user/settings", label: "账户设置", icon: Settings },
];

export default function UserLayout() {
  const { ready } = useRequireAuth();
  return (
    <div className="flex min-h-full flex-col">
      <Announcement />
      <div className="mx-auto w-full max-w-[67.5rem] px-6">
        <header className="flex h-14 items-center justify-between">
          <Logo />
          <UserAvatarMenu />
        </header>
        <nav className="mt-3 flex items-center gap-1 overflow-x-auto border-b" aria-label="个人中心">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  "relative flex h-10 items-center gap-1.5 px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground",
                )
              }
            >
              <t.icon className="size-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>
        <main className="py-6">{ready ? <Outlet /> : <FullSpinner />}</main>
      </div>
    </div>
  );
}
