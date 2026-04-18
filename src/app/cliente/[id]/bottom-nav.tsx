"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bolt, Home, LifeBuoy, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

type Tab = {
  id: string;
  label: string;
  icon: typeof Home;
  href: (plantId: string) => string;
  matches: (pathname: string, plantId: string) => boolean;
};

const TABS: Tab[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    href: (id) => `/cliente/${id}`,
    matches: (p, id) => p === `/cliente/${id}`,
  },
  {
    id: "energia",
    label: "Energía",
    icon: Bolt,
    href: (id) => `/cliente/${id}/energia`,
    matches: (p, id) => p.startsWith(`/cliente/${id}/energia`),
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: BarChart3,
    href: (id) => `/cliente/${id}/reportes`,
    matches: (p, id) => p.startsWith(`/cliente/${id}/reportes`),
  },
  {
    id: "soporte",
    label: "Soporte",
    icon: LifeBuoy,
    href: (id) => `/cliente/${id}/soporte`,
    matches: (p, id) => p.startsWith(`/cliente/${id}/soporte`),
  },
  {
    id: "perfil",
    label: "Perfil",
    icon: UserRound,
    href: (id) => `/cliente/${id}/perfil`,
    matches: (p, id) => p.startsWith(`/cliente/${id}/perfil`),
  },
];

export function BottomNav({ plantId }: { plantId: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg items-center justify-around gap-1 rounded-t-3xl bg-white/85 px-3 pb-[calc(env(safe-area-inset-bottom,0)+12px)] pt-3 shadow-[0_-12px_32px_rgba(23,29,22,0.08)] backdrop-blur-xl"
      aria-label="Navegación principal"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = t.matches(pathname, plantId);
        return (
          <Link
            key={t.id}
            href={t.href(plantId)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-2 py-1.5 transition-all duration-150",
              active
                ? "bg-m3-surface-container-low text-m3-primary"
                : "text-stone-500 hover:bg-m3-surface-container-low/60 hover:text-m3-on-surface",
            )}
          >
            <Icon className={cn("h-5 w-5", active && "stroke-[2.3]")} />
            <span
              className={cn(
                "mt-0.5 truncate text-[11px]",
                active ? "font-semibold" : "font-medium",
              )}
            >
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
