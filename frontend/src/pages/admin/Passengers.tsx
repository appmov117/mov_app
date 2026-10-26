import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api.ts";
import { pesos, when } from "../../lib/format.ts";
import { AccountActions, AccountBadge } from "./Accounts.tsx";
import { Badge, Drawer, Empty, Field, Filters, Page, Panel } from "./ui.tsx";

type PassengerRow = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  total_rides: number;
  created_at: string | null;
};

type PassengerDetail = PassengerRow & {
  saved_places: number;
  favorite_drivers: number;
  rides: { id: string; status: string; fare_amount: number | null; created_at: string | null }[];
};

type Filter = "all" | "active" | "suspended" | "deleted";

export function Passengers() {
  const [filter, setFilter] = useState<Filter>("active");
  const [open, setOpen] = useState<string | null>(null);
  const passengers = useQuery({ queryKey: ["admin-passengers"], queryFn: () => api<PassengerRow[]>("/api/v1/admin/passengers") });
  const all = passengers.data ?? [];
  const rows = all.filter((row) => filter === "all" || row.status === filter);
  const count = (status: Filter) => all.filter((row) => status === "all" || row.status === status).length;

  return (
    <Page title="Pasajeros" description="Consulta a los pasajeros, sus viajes y sus datos de contacto.">
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          { id: "active", label: "Activos", count: count("active") },
          { id: "suspended", label: "Suspendidos", count: count("suspended") },
          { id: "deleted", label: "Eliminados", count: count("deleted") },
          { id: "all", label: "Todos", count: count("all") },
        ]}
      />
      <Panel className="mt-4 overflow-hidden">
        {rows.length === 0 && passengers.isSuccess && <Empty title="No hay pasajeros en esta lista" />}
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="border-b border-line last:border-0">
              <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-foam/60 md:px-5" onClick={() => setOpen(row.id)}>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{row.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[row.phone, row.email].filter(Boolean).join(" · ") || "Sin datos de contacto"} · {row.total_rides} viajes
                  </span>
                </span>
                <AccountBadge status={row.status} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {open && <PassengerDrawer id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function PassengerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const passenger = useQuery({ queryKey: ["admin-passenger", id], queryFn: () => api<PassengerDetail>(`/api/v1/admin/passengers/${id}`) });
  const data = passenger.data;

  return (
    <Drawer title={data?.name ?? "Pasajero"} onClose={onClose}>
      {!data && <p className="text-sm text-muted">{passenger.error ? (passenger.error as Error).message : "Cargando pasajero"}</p>}
      {data && (
        <div className="space-y-6">
          <section>
            <div className="mb-2"><AccountBadge status={data.status} /></div>
            <Field label="Teléfono">{data.phone ? <a href={`tel:${data.phone}`} className="text-ink underline">{data.phone}</a> : "—"}</Field>
            <Field label="Correo">{data.email ?? "—"}</Field>
            <Field label="Viajes completados">{data.total_rides}</Field>
            <Field label="Lugares guardados">{data.saved_places}</Field>
            <Field label="Conductores favoritos">{data.favorite_drivers}</Field>
            <Field label="Alta">{when(data.created_at)}</Field>
          </section>
          <section>
            <h3 className="mb-1 font-bold">Viajes recientes</h3>
            {data.rides.length === 0 && <p className="text-sm text-muted">Sin viajes.</p>}
            {data.rides.map((ride) => (
              <div key={ride.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
                <span className="text-muted">{when(ride.created_at)}</span>
                <span className="flex items-center gap-3"><span className="font-semibold tabular-nums">{pesos(ride.fare_amount)}</span><Badge status={ride.status} /></span>
              </div>
            ))}
          </section>
          <AccountActions userId={data.user_id} status={data.status} />
        </div>
      )}
    </Drawer>
  );
}
