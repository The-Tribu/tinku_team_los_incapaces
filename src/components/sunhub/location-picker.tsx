"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

const InnerPicker = dynamic(() => import("./location-picker-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando mapa…</div>
  ),
});

type SearchHit = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

const DEFAULT_LAT = 4.6;
const DEFAULT_LNG = -74.07;

function toNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function LocationPicker({
  lat,
  lng,
  onChange,
  region,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  region?: string;
}) {
  const parsedLat = toNumber(lat);
  const parsedLng = toNumber(lng);
  const effectiveLat = parsedLat ?? DEFAULT_LAT;
  const effectiveLng = parsedLng ?? DEFAULT_LNG;

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", query);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "5");
        url.searchParams.set("addressdetails", "0");
        const res = await fetch(url.toString(), {
          headers: { "Accept-Language": "es" },
        });
        if (!res.ok) throw new Error("No se pudo buscar la dirección");
        const data: SearchHit[] = await res.json();
        setHits(data);
      } catch (e) {
        setError((e as Error).message);
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handlePick = (newLat: number, newLng: number) => {
    onChange(newLat.toFixed(5), newLng.toFixed(5));
  };

  const pickHit = (hit: SearchHit) => {
    const nLat = Number(hit.lat);
    const nLng = Number(hit.lon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return;
    onChange(nLat.toFixed(5), nLng.toFixed(5));
    setQuery(hit.display_name);
    setHits([]);
    setRecenterKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              region ? `Buscar lugar en ${region}…` : "Buscar dirección, ciudad o municipio…"
            }
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />
          ) : null}
        </div>
        {hits.length > 0 ? (
          <ul className="absolute z-[1000] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
            {hits.map((h) => (
              <li key={h.place_id}>
                <button
                  type="button"
                  onClick={() => pickHit(h)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-emerald-50"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="line-clamp-2 text-xs text-slate-700">{h.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="mt-1 text-[11px] text-rose-600">{error}</p> : null}
      </div>

      <div className="h-72 overflow-hidden rounded-xl border border-slate-200">
        <InnerPicker
          lat={effectiveLat}
          lng={effectiveLng}
          recenterKey={recenterKey}
          onPick={handlePick}
        />
      </div>

      <p className="text-[11px] text-slate-500">
        Haz clic en el mapa o arrastra el pin para ajustar la ubicación. También puedes escribir la
        latitud/longitud a mano.
      </p>
    </div>
  );
}
