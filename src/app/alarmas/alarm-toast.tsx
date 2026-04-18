"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlarmToast = {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  body?: string;
};

export function AlarmToastStack({
  toasts,
  onDismiss,
}: {
  toasts: AlarmToast[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Auto-dismiss del más viejo cada 6s.
  useEffect(() => {
    if (toasts.length === 0) return;
    const first = toasts[toasts.length - 1];
    const timer = setTimeout(() => onDismiss(first.id), 6000);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-6 z-[120] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : Info;
        const tone =
          t.kind === "success"
            ? "border-emerald-200"
            : t.kind === "error"
              ? "border-rose-200"
              : "border-sky-200";
        const iconTone =
          t.kind === "success"
            ? "bg-emerald-100 text-emerald-700"
            : t.kind === "error"
              ? "bg-rose-100 text-rose-700"
              : "bg-sky-100 text-sky-700";
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg",
              tone,
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                iconTone,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{t.title}</div>
              {t.body ? <div className="text-xs text-slate-600">{t.body}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
