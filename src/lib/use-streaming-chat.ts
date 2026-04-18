"use client";

/**
 * Pacing por requestAnimationFrame para el streaming del Copilot.
 *
 * MiniMax envía deltas en ráfagas (varios tokens por chunk de red). Si pintamos
 * cada chunk crudo, la UI salta de bloque en bloque. Este hook desacopla la
 * tasa de red de la tasa de render: acumula los chunks en `pendingRef` y
 * drena ~baseCps caracteres por segundo hacia `displayed`, con un boost
 * adaptativo cuando el buffer crece para no quedarse cien tokens atrás.
 *
 * Respeta `prefers-reduced-motion`: si el usuario lo activó, salta el pacing
 * y muestra el texto recibido tal cual.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type StreamingBuffer = {
  /** Texto que la UI debe pintar ahora mismo (pacificado). */
  displayed: string;
  /** Empuja un chunk recién llegado de la red al buffer. */
  push: (chunk: string) => void;
  /** Vuelca el resto sin animación (al cerrar el stream). */
  finalize: () => string;
  /** Limpia todo y cancela el rAF (al iniciar un nuevo mensaje). */
  reset: () => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useStreamingChatBuffer(opts?: { baseCps?: number }): StreamingBuffer {
  const baseCps = opts?.baseCps ?? 90;
  const [displayed, setDisplayed] = useState("");
  const pendingRef = useRef("");
  const displayedRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  const cancelLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // El loop se redefine en cada render para capturar el último `baseCps`,
  // pero sólo hay un rAF activo a la vez (gobernado por rafRef).
  const tick = useCallback(
    (now: number) => {
      const dt = Math.min(0.1, (now - lastTsRef.current) / 1000);
      lastTsRef.current = now;
      const remaining = pendingRef.current.length - displayedRef.current.length;
      if (remaining <= 0) {
        rafRef.current = null;
        return;
      }
      // Boost adaptativo: cuanto más rezago, más rápido draina.
      const boost = Math.floor(remaining / 60);
      const cps = baseCps + boost * 30;
      const take = Math.min(remaining, Math.max(1, Math.floor(cps * dt)));
      displayedRef.current = pendingRef.current.slice(
        0,
        displayedRef.current.length + take,
      );
      setDisplayed(displayedRef.current);
      rafRef.current = requestAnimationFrame(tick);
    },
    [baseCps],
  );

  const ensureLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const push = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      pendingRef.current += chunk;
      if (prefersReducedMotion()) {
        // Sin animación: vuelca de una y no agenda rAF.
        displayedRef.current = pendingRef.current;
        setDisplayed(displayedRef.current);
        return;
      }
      ensureLoop();
    },
    [ensureLoop],
  );

  const finalize = useCallback(() => {
    cancelLoop();
    displayedRef.current = pendingRef.current;
    setDisplayed(displayedRef.current);
    return displayedRef.current;
  }, [cancelLoop]);

  const reset = useCallback(() => {
    cancelLoop();
    pendingRef.current = "";
    displayedRef.current = "";
    setDisplayed("");
  }, [cancelLoop]);

  // Cleanup al desmontar (p. ej. cerrar el FAB).
  useEffect(() => cancelLoop, [cancelLoop]);

  return { displayed, push, finalize, reset };
}

/**
 * `true` si el viewport del scroll está dentro de `slackPx` del fondo.
 * Lo usamos para decidir si seguir auto-scrolleando durante el streaming
 * sin secuestrar al usuario que se desplazó arriba a leer algo.
 */
export function isNearBottom(el: HTMLElement, slackPx = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < slackPx;
}
