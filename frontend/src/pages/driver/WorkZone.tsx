import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import { Link, useNavigate } from "react-router-dom";
import { FlatMap, MERIDA } from "../../components/FlatMap.tsx";
import type { Pin } from "../../components/MapView.tsx";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { locateOnce } from "../../lib/position.ts";

export type WorkZone = { latitude: number; longitude: number; radius_m: number; active: boolean };

const EARTH_M = 6_371_000;

/** Polígono de 64 lados que aproxima el círculo de la zona sobre el mapa. */
function circle(center: Pin, radius: number): number[][] {
  const lat = (center.latitude * Math.PI) / 180;
  const lng = (center.longitude * Math.PI) / 180;
  const angular = radius / EARTH_M;
  return Array.from({ length: 65 }, (_, index) => {
    const bearing = (index / 64) * 2 * Math.PI;
    const pointLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const pointLng =
      lng + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(pointLat));
    return [(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI];
  });
}

/** El conductor fija el centro arrastrando el mapa y elige el radio de su zona de trabajo. */
export function DriverWorkZone() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["work-zone"], queryFn: () => api<WorkZone | null>("/api/v1/drivers/me/work-zone") });
  const me = useQuery({ queryKey: ["driver"], queryFn: () => api<{ location: Pin | null }>("/api/v1/drivers/me") });
  const [center, setCenter] = useState<Pin | null>(null);
  const [radius, setRadius] = useState(3000);
  const [active, setActive] = useState(true);
  const [frameKey, setFrameKey] = useState("");
  // Con una zona guardada se abre en vista; "Editar zona" permite moverla y cambiar el radio.
  const [editing, setEditing] = useState(false);

  // Arranca en la zona guardada o, si no hay, en la última ubicación del conductor.
  useEffect(() => {
    if (center || !saved.isSuccess || !me.isSuccess) return;
    const start = saved.data ?? { ...(me.data.location ?? MERIDA), radius_m: 3000, active: true };
    setCenter({ latitude: start.latitude, longitude: start.longitude });
    setRadius(start.radius_m);
    setActive(start.active);
    setEditing(!saved.data);
    setFrameKey("inicio");
  }, [saved.isSuccess, me.isSuccess]);

  // Al cambiar el radio, el mapa se reencuadra para mostrar el círculo completo.
  useEffect(() => {
    if (!frameKey) return;
    const timer = window.setTimeout(() => setFrameKey(`radio-${radius}`), 250);
    return () => window.clearTimeout(timer);
  }, [radius]);

  const save = useMutation({
    mutationFn: () =>
      api<WorkZone>("/api/v1/drivers/me/work-zone", { method: "PUT", body: JSON.stringify({ ...center, radius_m: radius, active }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["work-zone"], data);
      setEditing(false);
    },
  });
  const toggle = useMutation({
    mutationFn: (value: boolean) =>
      api<WorkZone>("/api/v1/drivers/me/work-zone", { method: "PATCH", body: JSON.stringify({ active: value }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["work-zone"], data);
      setActive(data.active);
    },
  });

  function cancelEdit() {
    if (!saved.data) return;
    setCenter({ latitude: saved.data.latitude, longitude: saved.data.longitude });
    setRadius(saved.data.radius_m);
    setActive(saved.data.active);
    setEditing(false);
    setFrameKey(`guardada-${Date.now()}`);
  }
  const ring = center ? circle(center, radius) : null;
  const changed =
    center != null &&
    (!saved.data ||
      saved.data.radius_m !== radius ||
      saved.data.active !== active ||
      Math.abs(saved.data.latitude - center.latitude) > 1e-5 ||
      Math.abs(saved.data.longitude - center.longitude) > 1e-5);

  return (
    <Shell nav={false} scroll={false} full>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-[260px] flex-1">
          <FlatMap
            zoom={12}
            fit={ring?.map(([longitude, latitude]) => ({ latitude, longitude }))}
            fitKey={frameKey}
            padding={{ top: 40, bottom: 40, left: 40, right: 40 }}
            onMove={editing ? setCenter : undefined}
          >
            {ring && (
              <Source id="zone" type="geojson" data={{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }}>
                <Layer id="zone-fill" type="fill" paint={{ "fill-color": "#0b6e7f", "fill-opacity": active ? 0.14 : 0.05 }} />
                <Layer id="zone-line" type="line" paint={{ "line-color": "#0b6e7f", "line-width": 2, "line-dasharray": active ? [1, 0] : [2, 2] }} />
              </Source>
            )}
          </FlatMap>
          {editing && (
            <MapPin
              size={34}
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full fill-brand-strong text-surface drop-shadow"
              aria-hidden="true"
            />
          )}
          <Link to="/conductor" aria-label="Volver" className="absolute left-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-surface shadow">
            <ChevronLeft size={22} />
          </Link>
          {editing && (
            <button
              type="button"
              aria-label="Centrar en mi ubicación"
              className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-surface shadow"
              onClick={() =>
                void locateOnce().then((pin) => {
                  if (!pin) return;
                  setCenter(pin);
                  setFrameKey(`yo-${Date.now()}`);
                })
              }
            >
              <LocateFixed size={20} />
            </button>
          )}
        </div>
        <section className="space-y-4 px-5 pb-6 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Mi zona de trabajo</h1>
              <p className="mt-1 text-sm text-muted">
                Dentro de tu zona te llegan viajes que empiezan en ella. Fuera, solo los que te acercan de regreso.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={active}
              aria-label={active ? "Desactivar zona" : "Activar zona"}
              disabled={toggle.isPending}
              className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${active ? "bg-ok" : "bg-ink/15"}`}
              onClick={() => (editing ? setActive((value) => !value) : toggle.mutate(!active))}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${active ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {editing ? (
            <>
              <label className="block">
                <span className="flex justify-between text-sm font-semibold">
                  Radio <span className="tabular-nums">{(radius / 1000).toFixed(1)} km</span>
                </span>
                <input
                  type="range"
                  min={1000}
                  max={10000}
                  step={500}
                  value={radius}
                  className="mt-2 w-full accent-[var(--color-brand-strong)]"
                  onChange={(event) => setRadius(Number(event.target.value))}
                />
              </label>
              {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
              <button
                type="button"
                className="h-12 w-full rounded-full bg-brand-strong font-semibold text-white disabled:opacity-50"
                disabled={!changed || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Guardando" : "Guardar zona"}
              </button>
              {saved.data ? (
                <button type="button" className="h-11 w-full rounded-full font-semibold text-muted" onClick={cancelEdit}>
                  Cancelar
                </button>
              ) : (
                <p className="text-center text-xs text-muted">Mueve el mapa para colocar el centro de tu zona.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">
                Radio de {(radius / 1000).toFixed(1)} km · {active ? "Activa" : "Desactivada"}
              </p>
              {toggle.error && <p className="text-sm text-danger" role="alert">{(toggle.error as Error).message}</p>}
              <button type="button" className="h-12 w-full rounded-full bg-brand-strong font-semibold text-white" onClick={() => navigate("/conductor")}>
                Volver al mapa
              </button>
              <button type="button" className="h-12 w-full rounded-full border border-line font-semibold" onClick={() => {
                  setEditing(true);
                  setFrameKey(`editar-${Date.now()}`);
                }}
              >
                Editar zona
              </button>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
