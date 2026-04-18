import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CloudSun,
  FileText,
  Gauge,
  LayoutDashboard,
  Plus,
  Settings,
  Sun,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getSessionUser, type Role } from "@/lib/auth";
import { UserMenu } from "./user-menu";
import { AlarmBell } from "./alarm-bell";
import { JobsIndicator } from "./jobs-indicator";
import { CopilotFab } from "./copilot-fab";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  roles?: Role[]; // si no se define → visible para todos los roles
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/plantas", label: "Plantas", icon: <Sun className="h-4 w-4" /> },
  { href: "/alarmas", label: "Alarmas", icon: <AlertTriangle className="h-4 w-4" /> },
  { href: "/predicciones", label: "Predicción", icon: <Timer className="h-4 w-4" /> },
  { href: "/reportes", label: "Reportes", icon: <FileText className="h-4 w-4" /> },
  { href: "/clima", label: "Clima", icon: <CloudSun className="h-4 w-4" /> },
  { href: "/costo-beneficio", label: "Proveedores", icon: <Wallet className="h-4 w-4" /> },
  { href: "/onboarding", label: "Onboarding", icon: <Plus className="h-4 w-4" />, roles: ["admin", "ops"] },
  { href: "/configuracion", label: "Configuración", icon: <Settings className="h-4 w-4" />, roles: ["admin", "ops"] },
  { href: "/usuarios", label: "Usuarios", icon: <Users className="h-4 w-4" />, roles: ["admin"] },
];

export async function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  // Guard global: si por alguna razón llegamos aquí sin sesión, mandamos al login.
  // (el middleware de Next ya protege, pero esto hace doble check server-side)
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <span className="font-heading text-xl font-bold text-sunhub-primary">SunHub</span>
          <Gauge className="h-4 w-4 text-amber-500" />
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600",
                "hover:bg-emerald-50 hover:text-emerald-700",
              )}
            >
              <span className="text-slate-400">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mx-3 mt-6 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white">
          <div className="text-xs font-medium opacity-80">Demo SunHub</div>
          <div className="mt-1 text-sm font-semibold">Hackathon Tinku 2026</div>
          <div className="mt-2 text-[11px] opacity-80">Equipo Los Incapaces</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div>
            <h1 className="font-heading text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <JobsIndicator />
            <AlarmBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <CopilotFab />
    </div>
  );
}
