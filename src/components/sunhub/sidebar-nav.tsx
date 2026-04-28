"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SidebarItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export function SidebarNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              active
                ? "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700",
            )}
          >
            <span className={active ? "text-white" : "text-slate-400"}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
