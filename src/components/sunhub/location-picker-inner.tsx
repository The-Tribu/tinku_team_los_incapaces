"use client";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L, { type Map as LeafletMap, type Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

const pinIcon = L.divIcon({
  className: "sunhub-pin",
  html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#059669;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.25);transform:rotate(-45deg);"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: 0.6 });
  }, [lat, lng, zoom, map]);
  return null;
}

export default function LocationPickerInner({
  lat,
  lng,
  recenterKey,
  onPick,
}: {
  lat: number;
  lng: number;
  recenterKey: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const center = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);

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
      <ClickHandler onPick={onPick} />
      <Recenter lat={lat} lng={lng} zoom={recenterKey > 0 ? 12 : undefined} />
      <Marker
        position={center}
        icon={pinIcon}
        draggable
        eventHandlers={{
          dragend: () => {
            const m = markerRef.current;
            if (!m) return;
            const pos = m.getLatLng();
            onPick(pos.lat, pos.lng);
          },
        }}
        ref={(el) => {
          markerRef.current = el ?? null;
        }}
      />
    </MapContainer>
  );
}
