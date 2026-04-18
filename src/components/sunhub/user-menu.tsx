"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BellRing, ChevronDown, LogOut, Shield, UserCog, UserRound } from "lucide-react";
import type { Role, SessionUser } from "@/lib/auth";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  ops: "Operaciones",
  viewer: "Lectura",
};

const ROLE_ICON: Record<Role, React.ReactNode> = {
  admin: <Shield className="h-3.5 w-3.5" />,
  ops: <UserCog className="h-3.5 w-3.5" />,
  viewer: <UserRound className="h-3.5 w-3.5" />,
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-1.5 py-1 pr-2 text-sm transition hover:border-emerald-300 hover:bg-emerald-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
          {initials(user.name)}
        </span>
        <span className="hidden text-xs font-medium text-slate-700 sm:block">{user.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">{user.name}</div>
            <div className="text-xs text-slate-500">{user.email}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {ROLE_ICON[user.role]}
              {ROLE_LABEL[user.role]}
            </div>
          </div>
          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <BellRing className="h-4 w-4 text-slate-400" />
            Notificaciones y perfil
          </Link>
          <button
            onClick={logout}
            disabled={busy}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 text-slate-400" />
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
