import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Layer, Marker, Source } from "react-map-gl/mapbox";
import type { Pin } from "../../components/MapView.tsx";
import { api } from "../../lib/api.ts";
import { useWide } from "../../lib/useWide.ts";
import { pesos, splitLabel } from "../../lib/format.ts";
import { FlatMap } from "../../components/FlatMap.tsx";
import { Dot, RideDrawer } from "./Rides.tsx";
import { ago, Badge, type Person } from "./ui.tsx";

type LiveDriver = { id: string; name: string; status: string; plate: string | null; location: Pin; updated_at: string };
type LiveRide = {
  id: string;
  status: string;
  origin: Pin;
  destination: Pin;
  origin_label: string | null;
  destination_label: string | null;
  estimated_fare: number | null;
  driver_location: Pin | null;
  passenger: Person;
  driver: Person;
  created_at: string | null;
};
type LiveRequest = { id: string; status: string; origin: Pin; origin_label: string | null; destination_label: string | null; created_at: string | null };
type LiveData = { drivers: LiveDriver[]; rides: LiveRide[]; requests: LiveRequest[] };

const DRIVER_COLORS = { online: "#15803d", busy: "#0b6e7f", paused: "#e8b21c" } as const;
const PANEL = { top: 60, bottom: 60, left: 440, right: 60 };
const PLAIN = { top: 40, bottom: 40, left: 40, right: 40 };

/** Operación en este momento: conductores conectados, viajes en curso y solicitudes sin conductor. */
export function Live() {
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<Pin | null>(null);
  const wide = useWide();
  const live = useQuery({ queryKey: ["admin-live"], queryFn: () => api<LiveData>("/api/v1/admin/live"), refetchInterval: 5000 });
  const data = live.data ?? { drivers: [], rides: [], requests: [] };
  const counts = {
    online: data.drivers.filter((driver) => driver.status === "online").length,
    busy: data.drivers.filter((driver) => driver.status === "busy").length,
    paused: data.drivers.filter((driver) => driver.status === "paused").length,
  };
  const points = [...data.drivers.map((driver) => driver.location), ...data.requests.map((request) => request.origin)];
  const lines = {
    type: "FeatureCollection" as const,
    features: data.rides.map((ride) => ({
      type: "Feature" as const,
      properties: { id: ride.id },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [ride.origin.longitude, ride.origin.latitude],
          [ride.destination.longitude, ride.destination.latitude],
        ],
      },
    })),
  };
  const drivers = {
    type: "FeatureCollection" as const,
    features: data.drivers.map((driver) => ({
      type: "Feature" as const,
      properties: { status: driver.status },
      geometry: { type: "Point" as const, coordinates: [driver.location.longitude, driver.location.latitude] },
    })),
  };

  return (
    <div className="flex h-full flex-col lg:relative lg:block">
      <div className="relative h-[42%] min-h-[240px] shrink-0 lg:absolute lg:inset-0 lg:h-auto">
      <FlatMap fit={points} fitKey={live.isSuccess ? "ready" : ""} focus={focus} padding={wide ? PANEL : PLAIN}>
        <Source id="live-rides" type="geojson" data={lines}>
          <Layer id="live-rides-line" type="line" paint={{ "line-color": "#14232b", "line-width": 2, "line-opacity": 0.45, "line-dasharray": [2, 2] }} />
        </Source>
        <Source id="live-drivers" type="geojson" data={drivers}>
          <Layer
            id="live-drivers-dot"
            type="circle"
            paint={{
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
              "circle-color": ["match", ["get", "status"], "busy", DRIVER_COLORS.busy, "paused", DRIVER_COLORS.paused, DRIVER_COLORS.online],
            }}
          />
        </Source>
        {data.rides.map((ride) => (
          <Marker key={ride.id} latitude={ride.destination.latitude} longitude={ride.destination.longitude}>
            <Dot color="#14232b" label="B" />
          </Marker>
        ))}
        {data.requests.map((request) => (
          <Marker key={request.id} latitude={request.origin.latitude} longitude={request.origin.longitude}>
            <span className="relative grid h-6 w-6 place-items-center" title="Buscando conductor">
              <span className="ruta-halo" style={{ background: "rgb(245 158 11 / 0.35)" }} />
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-[#f59e0b] shadow" />
            </span>
          </Marker>
        ))}
      </FlatMap>
      </div>

      <aside className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-line bg-surface lg:absolute lg:bottom-4 lg:left-4 lg:top-4 lg:w-[400px] lg:flex-none lg:rounded-2xl lg:border lg:shadow-[0_18px_50px_rgba(16,24,32,0.16)]">
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold">En vivo</h1>
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${live.isError ? "bg-danger" : "bg-ok"}`} aria-hidden="true" />
              {live.isError ? "Sin conexión" : "Se actualiza cada 5 s"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Count label="Libres" value={counts.online} color={DRIVER_COLORS.online} />
            <Count label="En viaje" value={counts.busy} color={DRIVER_COLORS.busy} />
            <Count label="En pausa" value={counts.paused} color={DRIVER_COLORS.paused} />
            <Count label="Buscando" value={data.requests.length} color="#f59e0b" />
          </dl>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {data.requests.length > 0 && (
            <section className="border-b border-line px-5 py-3">
              <h2 className="mb-2 text-sm font-bold">Esperando conductor</h2>
              {data.requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-foam"
                  onClick={() => setFocus({ ...request.origin })}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{splitLabel(request.destination_label).place}</span>
                    <span className="block truncate text-xs text-muted">desde {splitLabel(request.origin_label).place}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-warn">{ago(request.created_at)}</span>
                </button>
              ))}
            </section>
          )}
          <section className="px-5 py-3">
            <h2 className="mb-2 text-sm font-bold">Viajes en curso · {data.rides.length}</h2>
            {data.rides.length === 0 && <p className="py-6 text-center text-sm text-muted">No hay viajes en este momento.</p>}
            {data.rides.map((ride) => (
              <button
                key={ride.id}
                type="button"
                className="mb-2 w-full rounded-xl border border-line px-3 py-3 text-left transition hover:border-ink"
                onClick={() => {
                  setFocus({ ...(ride.driver_location ?? ride.origin) });
                  setOpen(ride.id);
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{splitLabel(ride.destination_label).place}</span>
                  <Badge status={ride.status} />
                </span>
                <span className="mt-1 block truncate text-xs text-muted">
                  {ride.driver?.name ?? "Conductor"} {ride.driver?.plate ? `· ${ride.driver.plate}` : ""} → {ride.passenger?.name ?? "Pasajero"}
                </span>
                <span className="mt-1 flex justify-between text-xs text-muted">
                  <span>{ago(ride.created_at)}</span>
                  <span className="font-semibold text-ink">{pesos(ride.estimated_fare)}</span>
                </span>
              </button>
            ))}
          </section>
        </div>
      </aside>
      {open && <RideDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-foam px-1 py-2">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-xl font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
