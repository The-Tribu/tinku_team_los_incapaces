import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◎" },
  { href: "/plantas", label: "Plantas", icon: "☀" },
  { href: "/alarmas", label: "Alarmas", icon: "!" },
  { href: "/auto-reparacion", label: "Auto-reparación", icon: "⟳" },
  { href: "/predicciones", label: "Predicción", icon: "⏳" },
  { href: "/copilot", label: "Copilot AI", icon: "✦" },
  { href: "/reportes", label: "Reportes", icon: "⎙" },
  { href: "/clima", label: "Clima", icon: "☁" },
  { href: "/costo-beneficio", label: "Proveedores", icon: "$" },
  { href: "/onboarding", label: "Onboarding", icon: "+" },
];

export function AppShell({
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
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <span className="font-heading text-xl font-bold text-sunhub-primary">SunHub</span>
          <span className="text-xs text-slate-400">⚡</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600",
                "hover:bg-emerald-50 hover:text-emerald-700",
              )}
            >
              <span className="w-4 text-center text-base text-slate-400">{item.icon}</span>
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
              TR
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
