import Link from "next/link";
import { Bell, ChevronLeft, CloudSun, MapPin } from "lucide-react";

type Props = {
  plantId: string;
  plantName: string;
  greetingName: string;
  subtitle?: string;
  weather?: string;
  showBack?: boolean;
  backHref?: string;
  /** Si se pasa, reemplaza la fila "Hola, X 👋" por un título. */
  title?: string;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}

/**
 * Top app bar mobile-first para el PWA del cliente. Sticky con fondo `surface`.
 */
export function TopBar({
  plantId,
  plantName,
  greetingName,
  subtitle,
  weather = "soleado 24°C",
  showBack = false,
  backHref,
  title,
}: Props) {
  return (
    <header className="sticky top-0 z-40 mx-auto flex w-full max-w-lg items-center justify-between gap-3 bg-m3-surface/90 px-5 py-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        {showBack ? (
          <Link
            href={backHref ?? `/cliente/${plantId}`}
            aria-label="Volver"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-m3-surface-container-low text-m3-on-surface transition active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-m3-primary to-m3-primary-container text-sm font-bold text-white shadow-sm"
          >
            {initials(plantName)}
          </span>
        )}
        <div className="min-w-0">
          {title ? (
            <h1 className="truncate font-heading text-lg font-bold tracking-tight text-m3-primary">
              {title}
            </h1>
          ) : (
            <h1 className="truncate font-heading text-xl font-bold tracking-tight text-m3-primary">
              Hola, {greetingName} 👋
            </h1>
          )}
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-stone-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{subtitle ?? plantName}</span>
            <span className="mx-1 text-stone-300">·</span>
            <CloudSun className="h-3 w-3 shrink-0" />
            <span className="truncate">{weather}</span>
          </p>
        </div>
      </div>
      <Link
        href="/alarmas"
        aria-label="Notificaciones"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-m3-primary transition hover:bg-m3-surface-container-high active:scale-95"
      >
        <Bell className="h-5 w-5" />
      </Link>
    </header>
  );
}
