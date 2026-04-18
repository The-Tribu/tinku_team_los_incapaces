"use client";
import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap, CircleMarker as LeafletCircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPoint } from "./fleet-map";

const STATUS_COLOR: Record<string, string> = {
  online: "#16A34A",
  warning: "#F59E0B",
  degraded: "#F97316",
  offline: "#DC2626",
  unknown: "#94A3B8",
};

function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 12, { duration: 0.8 });
  }, [map, target]);
  return null;
}

export default function FleetMapInner({
  points,
  focusedId,
  onSelectPlant,
}: {
  points: MapPoint[];
  focusedId?: string | null;
  onSelectPlant?: (id: string) => void;
}) {
  const center: [number, number] = [4.7, -74.0];
  const markerRefs = useRef(new Map<string, LeafletCircleMarker>());
  const mapRef = useRef<LeafletMap | null>(null);

  const focused = focusedId ? points.find((p) => p.id === focusedId) ?? null : null;

  useEffect(() => {
    if (!focusedId) return;
    const m = markerRefs.current.get(focusedId);
    if (m) m.openPopup();
  }, [focusedId]);

  return (
    <MapContainer
      ref={(instance) => {
        mapRef.current = instance ?? null;
      }}
      center={center}
      zoom={6}
      scrollWheelZoom
      doubleClickZoom
      className="h-full w-full"
      style={{ background: "#e2e8f0" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo target={focused ? { lat: focused.lat, lng: focused.lng, zoom: 12 } : null} />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={Math.max(6, Math.min(16, Math.sqrt(p.capacityKwp) / 2))}
          pathOptions={{
            color: STATUS_COLOR[p.status] ?? "#94A3B8",
            fillColor: STATUS_COLOR[p.status] ?? "#94A3B8",
            fillOpacity: p.id === focusedId ? 0.95 : 0.65,
            weight: p.id === focusedId ? 3 : 1.5,
          }}
          eventHandlers={
            onSelectPlant
              ? {
                  click: () => onSelectPlant(p.id),
                }
              : undefined
          }
          ref={(el) => {
            if (el) markerRefs.current.set(p.id, el);
            else markerRefs.current.delete(p.id);
          }}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold">{p.name}</div>
              <div className="text-slate-500">{p.code}</div>
              <div className="mt-1">
                {p.currentPowerKw.toFixed(1)} / {p.capacityKwp} kWp
              </div>
              <div className="text-slate-500 capitalize">{p.status}</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
