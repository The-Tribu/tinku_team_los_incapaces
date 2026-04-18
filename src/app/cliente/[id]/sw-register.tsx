"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Registra el service worker y ofrece un botón "instalar app" cuando el
 * navegador lo permite (Chrome/Edge). En iOS el prompt no existe, así que
 * mostramos un hint estático con la instrucción de "Agregar a inicio".
 */
export function SwRegister() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Registrar SW solo en producción para no pisar HMR en dev.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* ignora — offline igual funciona sin SW */
        });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Detectar si ya está instalada (display-mode: standalone).
    if (window.matchMedia?.("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    try {
      if (sessionStorage.getItem("sunhub-install-dismissed") === "1") {
        setDismissed(true);
      }
    } catch {
      /* storage bloqueado — no pasa nada */
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !prompt) return null;

  return (
    <div className="fixed inset-x-3 bottom-24 z-40 rounded-2xl bg-m3-on-surface/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-m3-primary text-white">
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Instala SunHub</div>
          <div className="text-[11px] opacity-80">
            Acceso rápido a tu energía, incluso sin conexión.
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await prompt.prompt();
              const choice = await prompt.userChoice;
              if (choice.outcome !== "accepted") setDismissed(true);
            } catch {
              setDismissed(true);
            }
            setPrompt(null);
          }}
          className="shrink-0 rounded-full bg-m3-secondary-container px-3 py-1.5 text-xs font-bold text-m3-on-secondary-container"
        >
          Instalar
        </button>
        <button
          type="button"
          aria-label="Descartar"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem("sunhub-install-dismissed", "1");
            } catch {
              /* ignora */
            }
          }}
          className="shrink-0 text-lg leading-none text-white/70"
        >
          ×
        </button>
      </div>
    </div>
  );
}
