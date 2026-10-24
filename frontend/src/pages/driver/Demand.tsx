import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Navigation } from "lucide-react";
import { useState } from "react";
import { Layer, Marker, Source } from "react-map-gl/mapbox";
import { Link } from "react-router-dom";
import { FlatMap } from "../../components/FlatMap.tsx";
import type { Pin } from "../../components/MapView.tsx";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { km } from "../../lib/format.ts";
import { heatFill, UNSERVED_LINE } from "../../lib/heat.ts";
import { googleMapsUrl } from "../../lib/maps.ts";

type Zone = {
  cell: string;
  count: number;
  unserved: number;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  distance_by_road: boolean;
};
type Demand = {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: Zone; geometry: { type: "Polygon"; coordinates: number[][][] } }[];
  total: number;
  location: Pin | null;
  zones: Zone[];
};
type Hours = "1" | "2" | "6";

const DIRECTIONS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];

/** Rumbo aproximado de una zona respecto al conductor, para ubicarla sin nombres de colonia. */
function direction(from: Pin, to: Pin) {
  const dy = to.latitude - from.latitude;
  const dx = (to.longitude - from.longitude) * Math.cos((from.latitude * Math.PI) / 180);
  const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;
  return DIRECTIONS.at(Math.round(((degrees + 360) % 360) / 45) % 8);
}

/** Muestra al conductor dónde hubo solicitudes recientes y dónde se quedaron sin conductor. */
export function DriverDemand() {
  const [hours, setHours] = useState<Hours>("2");
  const [focus, setFocus] = useState<Pin | null>(null);
  const demand = useQuery({
    queryKey: ["driver-demand", hours],
    queryFn: () => api<Demand>(`/api/v1/drivers/me/demand?hours=${hours}`),
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
  });
  const data = demand.data;
  const top = Math.max(1, ...(data?.features ?? []).map((feature) => feature.properties.count));
  const here = data?.location ?? null;
  const fit = [...(here ? [here] : []), ...(data?.zones ?? []).map((zone) => ({ latitude: zone.latitude, longitude: zone.longitude }))];

  return (
    <Shell scroll={false} full>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative h-[48%] min-h-[240px] shrink-0">
          <FlatMap fit={fit} fitKey={data ? `${hours}-${data.zones.length}` : ""} focus={focus} padding={{ top: 70, bottom: 40, left: 40, right: 40 }}>
            {data && (
              <Source id="demand" type="geojson" data={data}>
                <Layer
                  id="demand-fill"
                  type="fill"
                  paint={{
                    "fill-color": heatFill(top),
                    "fill-opacity": 0.8,
                  }}
                />
                <Layer
                  id="demand-unserved"
                  type="line"
                  filter={[">", ["get", "unserved"], 0]}
                  paint={{ "line-color": UNSERVED_LINE, "line-width": 2.5, "line-dasharray": [2, 1] }}
                />
              </Source>
            )}
            {here && (
              <Marker latitude={here.latitude} longitude={here.longitude}>
                <span className="block h-4 w-4 rounded-full border-2 border-white bg-[#2563eb] shadow" aria-label="Tu ubicación" />
              </Marker>
            )}
          </FlatMap>
          <Link to="/conductor" aria-label="Volver" className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-surface shadow">
            <ChevronLeft size={22} />
          </Link>
        </div>
        <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Zonas con demanda</h1>
              <p className="text-sm text-muted">
                {data ? `${data.total} solicitudes en ${hours === "1" ? "la última hora" : `las últimas ${hours} horas`}` : "Cargando"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-full bg-foam p-1" role="group" aria-label="Periodo">
              {(["1", "2", "6"] as Hours[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={hours === value}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${hours === value ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
                  onClick={() => setHours(value)}
                >
                  {value} h
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className="h-3 w-6 rounded-sm bg-gradient-to-r from-[#fde047] via-[#fb923c] to-[#ef4444]" aria-hidden="true" /> Rojo: más solicitudes.
            <span className="ml-2 h-3 w-3 rounded-sm border-2 border-dashed border-ink" aria-hidden="true" /> Sin conductor
          </p>
          {data?.zones.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted">Todavía no hay solicitudes en este periodo. Prueba con 6 h.</p>
          )}
          <ol className="mt-3 space-y-2">
            {data?.zones.map((zone) => {
              const center = { latitude: zone.latitude, longitude: zone.longitude };
              return (
                <li key={zone.cell} className={`rounded-2xl border p-3 ${zone.unserved > 0 ? "border-[#ef4444] bg-[#fef2f2]" : "border-line"}`}>
                  <button type="button" className="block w-full text-left" onClick={() => setFocus({ ...center })}>
                    <span className="block font-bold">
                      {zone.distance_m != null && here
                        ? `A ${zone.distance_by_road ? "" : "≈ "}${km(zone.distance_m)} ${zone.distance_by_road ? "por calle " : ""}al ${direction(here, center)}`
                        : "Zona con solicitudes"}
                    </span>
                    <span className="block text-sm text-muted">
                      {zone.count} {zone.count === 1 ? "solicitud" : "solicitudes"}
                      {zone.unserved > 0 ? ` · ${zone.unserved} sin conductor` : ""}
                    </span>
                  </button>
                  <a
                    href={googleMapsUrl(center, here)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-semibold text-surface"
                  >
                    <Navigation size={15} /> Ir a la zona
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </Shell>
  );
}
