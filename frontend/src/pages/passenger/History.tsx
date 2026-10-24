import { useQuery } from "@tanstack/react-query";
import { Car } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../../components/Shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Loading } from "../../components/ui/loading.tsx";
import { api } from "../../lib/api.ts";
import { dayGroup, pesos, splitLabel, statusLabel, when } from "../../lib/format.ts";

type Ride = {
  id: string;
  status: string;
  origin_label: string | null;
  destination_label: string | null;
  fare_amount: number | null;
  estimated_fare: number | null;
  created_at: string | null;
};

const filters = [
  { id: "all", label: "Todos" },
  { id: "completed", label: "Completados" },
  { id: "cancelled", label: "Cancelados" },
] as const;

export function PassengerHistory() {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const rides = useQuery({ queryKey: ["history"], queryFn: () => api<Ride[]>("/api/v1/passengers/me/rides") });
  const visible = (rides.data ?? []).filter((ride) => {
    if (filter === "completed") return ride.status === "completed";
    if (filter === "cancelled") return ride.status === "cancelled";
    return true;
  });
  const groups = new Map<string, Ride[]>();
  for (const ride of visible) {
    const key = dayGroup(ride.created_at);
    groups.set(key, [...(groups.get(key) ?? []), ride]);
  }

  return (
    <Shell>
      <div className="flex-1 bg-surface px-4 py-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">Mis viajes</h1>
        <div className="mt-4 flex gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === item.id ? "bg-ink text-surface" : "bg-foam text-ink/70"}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {rides.isLoading && <Loading label="Cargando viajes" />}
        {rides.error && !rides.data && <p className="mt-8 text-sm text-danger">{(rides.error as Error).message}</p>}
        {rides.error && rides.data && <p className="mt-4 text-xs text-muted">Sin conexión. Estos son tus viajes guardados.</p>}
        {rides.isSuccess && visible.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-foam text-muted">
              <Car size={26} aria-hidden="true" />
            </span>
            <p className="mt-4 font-bold">{filter === "all" ? "Todavía no hay viajes" : "Nada en esta lista"}</p>
            {filter === "all" ? (
              <Button asChild className="mt-5 w-auto">
                <Link to="/pasajero">Pedir un viaje</Link>
              </Button>
            ) : (
              <button type="button" className="mt-2 text-sm font-semibold text-ink underline" onClick={() => setFilter("all")}>
                Ver todos los viajes
              </button>
            )}
          </div>
        )}
        {[...groups.entries()].map(([label, items]) => (
          <section key={label} className="mt-6">
            <h2 className="text-sm font-bold text-muted">{label}</h2>
            <ul>
              {items.map((ride) => (
                <li key={ride.id} className="border-b border-line">
                  <Link to={`/pasajero/historial/${ride.id}`} className="flex items-center gap-3 py-4">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-foam text-muted">
                      <Car size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{splitLabel(ride.destination_label).place}</span>
                      <span className="block truncate text-xs text-muted">
                        {shortLabel(ride.origin_label)} · {when(ride.created_at)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-extrabold">{pesos(ride.fare_amount ?? ride.estimated_fare)}</span>
                      <span className="block text-[11px] text-muted">{statusLabel(ride.status)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}

function shortLabel(label: string | null) {
  if (!label) return "Viaje";
  return label.split(",")[0];
}
