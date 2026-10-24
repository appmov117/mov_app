import { useQuery } from "@tanstack/react-query";
import { Car, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { Shell } from "../../components/Shell.tsx";
import { Loading } from "../../components/ui/loading.tsx";
import { api } from "../../lib/api.ts";
import { clockTime, dayGroup, pesos, splitLabel, statusLabel } from "../../lib/format.ts";

type Ride = {
  id: string;
  status: string;
  destination_label: string | null;
  fare_amount: number | null;
  estimated_fare: number | null;
  created_at: string | null;
  passenger: { name: string } | null;
};

export function DriverTrips() {
  const rides = useQuery({ queryKey: ["driver-rides"], queryFn: () => api<Ride[]>("/api/v1/drivers/me/rides") });
  const list = rides.data ?? [];
  const completed = list.filter((ride) => ride.status === "completed");
  const total = completed.reduce((sum, ride) => sum + (ride.fare_amount ?? ride.estimated_fare ?? 0), 0);
  const groups = new Map<string, Ride[]>();
  for (const ride of list) {
    const key = dayGroup(ride.created_at);
    groups.set(key, [...(groups.get(key) ?? []), ride]);
  }

  return (
    <Shell>
      <div className="flex-1 bg-white px-4 py-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">Viajes</h1>

        {list.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 divide-x divide-line rounded-2xl bg-foam py-3 text-center">
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted">Completados</dt>
              <dd className="text-2xl font-extrabold">{completed.length}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted">Total cobrado</dt>
              <dd className="text-2xl font-extrabold">{pesos(total)}</dd>
            </div>
          </dl>
        )}

        {rides.isLoading && <Loading label="Cargando viajes" />}
        {rides.isSuccess && list.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-foam text-muted">
              <Car size={26} aria-hidden="true" />
            </span>
            <p className="mt-4 font-bold">Todavía no hay viajes</p>
            <p className="mt-1 max-w-[28ch] text-sm text-muted">Conéctate desde Inicio para empezar a recibir solicitudes.</p>
          </div>
        )}

        {[...groups.entries()].map(([label, items]) => (
          <section key={label} className="mt-6">
            <h2 className="text-sm font-bold text-muted">{label}</h2>
            <ul>
              {items.map((ride) => {
                const { place, service } = splitLabel(ride.destination_label);
                const cancelled = ride.status === "cancelled";
                const Icon = service === "Paquete" ? Package : Car;
                return (
                  <li key={ride.id} className="border-b border-line last:border-0">
                    <Link to={`/conductor/viajes/${ride.id}`} className="flex items-center gap-3 py-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foam text-muted">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{place}</span>
                        <span className="block truncate text-xs text-muted">
                          {[ride.passenger?.name, clockTime(ride.created_at), service].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className={`block font-extrabold ${cancelled ? "text-ink/35 line-through" : ""}`}>
                          {pesos(ride.fare_amount ?? ride.estimated_fare)}
                        </span>
                        <span className={`block text-[11px] ${cancelled ? "text-danger" : "text-muted"}`}>{statusLabel(ride.status)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
