"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Fila de tabla clickable. Usar en vez de <tr> estandar cuando queremos que
 * toda la fila navegue al detalle. Los descendientes siguen pudiendo manejar
 * su propio onClick (p.ej. boton de acciones) llamando stopPropagation.
 */
export function PlantRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      className={cn(
        "cursor-pointer border-t border-slate-100 transition hover:bg-slate-50",
        className,
      )}
    >
      {children}
    </tr>
  );
}
