"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Invisible client component that calls router.refresh() on a fixed interval.
 * Triggers a server-side re-fetch of all Server Components on the current page
 * without a full navigation — so live scraper data shows up automatically.
 */
export function LiveRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router  = useRouter();
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const ref = useRef(intervalMs);
  ref.current = intervalMs;

  useEffect(() => {
    const tick = () => {
      router.refresh();
      setLastAt(new Date());
    };
    const id = setInterval(tick, ref.current);
    return () => clearInterval(id);
  }, [router]);

  if (!lastAt) return null;

  return (
    <span className="text-xs text-slate-400 tabular-nums" title="Última actualización automática">
      ↻ {lastAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}
