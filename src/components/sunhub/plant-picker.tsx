"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export type PlantPickerOption = {
  id: string;
  code: string;
  name: string;
  client?: string | null;
};

/**
 * Combobox con búsqueda por código / nombre / cliente. Sustituye al `<select>`
 * nativo cuando la lista crece a decenas de plantas. Navegación por teclado:
 *   ↑/↓ mueve el highlight, Enter selecciona, Esc cierra.
 */
export function PlantPicker({
  plants,
  value,
  onChange,
  placeholder = "Buscar planta…",
  className,
  disabled,
}: {
  plants: PlantPickerOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => plants.find((p) => p.id === value) ?? null,
    [plants, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plants.slice(0, 50);
    return plants
      .filter((p) => {
        const hay =
          `${p.code} ${p.name} ${p.client ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [plants, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) handleSelect(pick.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 transition hover:bg-slate-50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                {selected.code}
              </span>
              <span className="truncate text-slate-800">{selected.name}</span>
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Código, nombre o cliente…"
              className="h-9 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              autoFocus
            />
            <span className="text-[11px] text-slate-400">
              {filtered.length} / {plants.length}
            </span>
          </div>
          <ul className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">
                Sin coincidencias
              </li>
            ) : (
              filtered.map((p, i) => {
                const isActive = i === highlight;
                const isSelected = p.id === value;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => handleSelect(p.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                        isActive
                          ? "bg-emerald-50 text-emerald-900"
                          : "text-slate-800 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[10px]",
                            isActive
                              ? "bg-white text-emerald-700"
                              : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {p.code}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.name}</div>
                          {p.client ? (
                            <div className="truncate text-[11px] text-slate-500">
                              {p.client}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {isSelected ? (
                        <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
