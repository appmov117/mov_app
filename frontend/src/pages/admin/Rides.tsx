import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Layer, Marker, Source } from "react-map-gl/mapbox";
import type { Pin } from "../../components/MapView.tsx";
import { api } from "../../lib/api.ts";
import { km, minutes, payLabel, pesos, splitLabel, when } from "../../lib/format.ts";
import { FlatMap } from "../../components/FlatMap.tsx";
import { Badge, CATEGORY, Drawer, Empty, Field, Filters, Page, Panel, PersonCell, type Person } from "./ui.tsx";

type RideRow = {
  id: string;
  status: string;
  origin_label: string | null;
  destination_label: string | null;
  fare_amount: number | null;
  estimated_fare: number | null;
  passenger: Person;
  driver: Person;
  created_at: string | null;
};

type RideDetail = {
  id: string;
  status: string;
  origin: Pin;
  destination: Pin;
  origin_label: string | null;
  destination_label: string | null;
  route: { coordinates: number[][] } | null;
  estimated_fare: number | null;
  fare_amount: number | null;
  payment_method: string | null;
  distance_m: number | null;
  duration_s: number | null;
  estimated_distance_m: number | null;
  passenger: Person;
  driver_contact: Person;
  driver: { location: Pin | null } | null;
  passenger_rating: { rating: number; comment: string | null } | null;
  driver_rating: { rating: number; comment: string | null } | null;
  events: { type: string; at: string | null }[];
  complaints: { id: string; author_role: string; category: string; status: string }[];
  message_count: number;
};

const EVENTS: Record<string, string> = {
  ride_accepted: "Conductor asignado",
  driver_arriving: "Conductor en camino",
  driver_arrived: "Conductor llegó",
  ride_started: "Viaje iniciado",
  stop_arrived: "Llegó a una parada",
  stop_continued: "Siguió a la siguiente parada",
  payment_method_selected: "Registró el cobro",
  ride_completed: "Viaje completado",
  ride_cancelled: "Viaje cancelado",
};

type Filter = "all" | "active" | "completed" | "cancelled";

export function Rides() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const rides = useQuery({
    queryKey: ["admin-rides", filter],
    queryFn: () => api<RideRow[]>(`/api/v1/admin/rides?status=${filter}`),
    refetchInterval: filter === "active" ? 10_000 : false,
  });

  return (
    <Page title="Viajes" description="Los 200 viajes más recientes. Toca uno para ver su ruta, sus tiempos y lo que reportaron.">
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: "Todos" },
          { id: "active", label: "En curso" },
          { id: "completed", label: "Completados" },
          { id: "cancelled", label: "Cancelados" },
        ]}
      />
      <Panel className="mt-4 overflow-hidden">
        {rides.data?.length === 0 && <Empty title="No hay viajes con este filtro" />}
        {(rides.data?.length ?? 0) > 0 && (
          <>
          <ul className="md:hidden">
            {rides.data?.map((ride) => (
              <li key={ride.id} className="border-b border-line last:border-0">
                <button type="button" className="block w-full px-4 py-3.5 text-left" onClick={() => setOpen(ride.id)}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{splitLabel(ride.destination_label).place}</span>
                      <span className="block truncate text-xs text-muted">desde {splitLabel(ride.origin_label).place} · {when(ride.created_at)}</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{pesos(ride.fare_amount ?? ride.estimated_fare)}</span>
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="truncate">{ride.passenger?.name ?? "—"} con {ride.driver?.name ?? "—"}</span>
                    <Badge status={ride.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-foam text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-3 py-3 font-semibold">Trayecto</th>
                <th className="px-3 py-3 font-semibold">Pasajero</th>
                <th className="px-3 py-3 font-semibold">Conductor</th>
                <th className="px-3 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 text-right font-semibold">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rides.data?.map((ride) => (
                <tr key={ride.id} className="cursor-pointer border-t border-line hover:bg-foam/60" onClick={() => setOpen(ride.id)}>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{when(ride.created_at)}</td>
                  <td className="max-w-[260px] px-3 py-3">
                    <span className="block truncate font-semibold">{splitLabel(ride.destination_label).place}</span>
                    <span className="block truncate text-xs text-muted">desde {splitLabel(ride.origin_label).place}</span>
                  </td>
                  <td className="max-w-[180px] px-3 py-3"><PersonCell person={ride.passenger} /></td>
                  <td className="max-w-[180px] px-3 py-3"><PersonCell person={ride.driver} /></td>
                  <td className="px-3 py-3"><Badge status={ride.status} /></td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-bold tabular-nums">{pesos(ride.fare_amount ?? ride.estimated_fare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Panel>
      {open && <RideDrawer id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

export function RideDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const ride = useQuery({
    queryKey: ["admin-ride", id],
    queryFn: () => api<RideDetail>(`/api/v1/admin/rides/${id}`),
    refetchInterval: 10_000,
  });
  const data = ride.data;
  const line = data?.route?.coordinates ?? (data ? [[data.origin.longitude, data.origin.latitude], [data.destination.longitude, data.destination.latitude]] : []);
  const car = data?.driver?.location;

  return (
    <Drawer title="Detalle del viaje" onClose={onClose}>
      {!data && <p className="text-sm text-muted">{ride.error ? (ride.error as Error).message : "Cargando viaje"}</p>}
      {data && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold">{splitLabel(data.destination_label).place}</p>
              <p className="truncate text-sm text-muted">desde {splitLabel(data.origin_label).place}</p>
            </div>
            <Badge status={data.status} />
          </div>
          <div className="h-56 overflow-hidden rounded-2xl border border-line">
            <FlatMap fit={[data.origin, data.destination]} fitKey={data.id} padding={{ top: 40, bottom: 40, left: 40, right: 40 }}>
              <Source id="ride-route" type="geojson" data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }}>
                <Layer id="ride-route-line" type="line" paint={{ "line-color": "#0b6e7f", "line-width": 4 }} layout={{ "line-cap": "round", "line-join": "round" }} />
              </Source>
              <Marker latitude={data.origin.latitude} longitude={data.origin.longitude}><Dot color="#0b6e7f" label="A" /></Marker>
              <Marker latitude={data.destination.latitude} longitude={data.destination.longitude}><Dot color="#14232b" label="B" /></Marker>
              {car && <Marker latitude={car.latitude} longitude={car.longitude}><Dot color="#2563eb" label="" /></Marker>}
            </FlatMap>
          </div>
          <section>
            <h3 className="mb-1 font-bold">Personas</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-foam p-3"><PersonCell person={data.passenger} role="Pasajero" /></div>
              <div className="rounded-xl bg-foam p-3"><PersonCell person={data.driver_contact} role="Conductor" /></div>
            </div>
          </section>
          <section>
            <h3 className="mb-1 font-bold">Cobro</h3>
            <Field label="Tarifa estimada">{pesos(data.estimated_fare)}</Field>
            <Field label="Cobrado">{pesos(data.fare_amount)}</Field>
            <Field label="Forma de pago">{data.fare_amount != null ? payLabel(data.payment_method) : "—"}</Field>
            <Field label="Distancia">{km(data.distance_m ?? data.estimated_distance_m)}</Field>
            <Field label="Duración">{minutes(data.duration_s)}</Field>
            <Field label="Mensajes en el chat">{data.message_count}</Field>
          </section>
          <section>
            <h3 className="mb-2 font-bold">Línea de tiempo</h3>
            <ol className="space-y-2 border-l-2 border-line pl-4 text-sm">
              {data.events.map((event, index) => (
                <li key={`${event.type}-${index}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-ink" aria-hidden="true" />
                  <span className="font-semibold">{EVENTS[event.type] ?? event.type}</span>
                  <span className="ml-2 text-muted">{when(event.at)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="mb-1 font-bold">Calificaciones</h3>
            <Field label="Del pasajero al conductor">{data.passenger_rating ? `${data.passenger_rating.rating} ★` : "Sin calificar"}</Field>
            {data.passenger_rating?.comment && <p className="pb-2 text-sm text-muted">“{data.passenger_rating.comment}”</p>}
            <Field label="Del conductor al pasajero">{data.driver_rating ? `${data.driver_rating.rating} ★` : "Sin calificar"}</Field>
            {data.driver_rating?.comment && <p className="pb-2 text-sm text-muted">“{data.driver_rating.comment}”</p>}
          </section>
          {data.complaints.length > 0 && (
            <section>
              <h3 className="mb-2 font-bold">Reportes</h3>
              {data.complaints.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
                  <span>{CATEGORY[item.category] ?? item.category} · de {item.author_role === "driver" ? "conductor" : "pasajero"}</span>
                  <Badge status={item.status} />
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-white text-[10px] font-extrabold text-white shadow" style={{ background: color }}>
      {label}
    </span>
  );
}
