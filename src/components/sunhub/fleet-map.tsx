"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const InnerMap = dynamic(() => import("./fleet-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Cargando mapa…
    </div>
  ),
});

export type MapPoint = {
  id: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  status: string;
  currentPowerKw: number;
  capacityKwp: number;
};

export function FleetMap({
  focusedId,
  onSelectPlant,
  heightClass,
}: {
  focusedId?: string | null;
  onSelectPlant?: (id: string) => void;
  heightClass?: string;
} = {}) {
  const [points, setPoints] = useState<MapPoint[]>([]);
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/plants?limit=500");
      const { rows } = await res.json();
      setPoints(
        rows
          .filter((r: { lat: number | null; lng: number | null }) => r.lat != null && r.lng != null)
          .map((r: MapPoint) => ({
            id: r.id,
            name: r.name,
            code: r.code,
            lat: r.lat,
            lng: r.lng,
            status: r.status,
            currentPowerKw: r.currentPowerKw,
            capacityKwp: r.capacityKwp,
          })),
      );
    }
    void load();
  }, []);

  return (
    <div className={`${heightClass ?? "h-80"} overflow-hidden rounded-xl border border-slate-200`}>
      <InnerMap points={points} focusedId={focusedId ?? null} onSelectPlant={onSelectPlant} />
    </div>
  );
}
