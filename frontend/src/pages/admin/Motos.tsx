import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.ts";
import { pesos, splitLabel, when } from "../../lib/format.ts";
import { tripPrice, useTariffs } from "./Tariffs.tsx";
import { Badge, Empty, Kpi, Page, Panel, PersonCell, type Person } from "./ui.tsx";

type MotoDriver = {
  id: string;
  name: string;
  phone: string;
  status: string;
  verification_status: string;
  rating: number;
  vehicle: string;
  plate: string;
};
type Overview = { drivers: MotoDriver[]; online: number; rides_week: number; volume_week: number };
type MotoRide = {
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

export function Motos() {
  const overview = useQuery({ queryKey: ["admin-motos"], queryFn: () => api<Overview>("/api/v1/admin/motos") });
  const rides = useQuery({ queryKey: ["admin-rides", "all", "moto"], queryFn: () => api<MotoRide[]>("/api/v1/admin/rides?service=moto") });
  const tariffs = useTariffs();
  const data = overview.data;
  const moto = tariffs.data?.moto;

  return (
    <Page title="Motos" description="Conductores que trabajan en moto y sus viajes. Los viajes en moto solo se ofrecen a conductores con moto registrada.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Motos registradas" value={String(data?.drivers.length ?? "—")} />
        <Kpi label="Conectadas ahora" value={String(data?.online ?? "—")} tone={data?.online ? "brand" : undefined} />
        <Kpi label="Viajes en 7 días" value={String(data?.rides_week ?? "—")} />
        <Kpi label="Cobrado en 7 días" value={pesos(data?.volume_week)} note="Lo que declararon los conductores" />
      </div>

      <Panel
        title="Tarifa de moto"
        className="mt-6"
        aside={<Link to="/admin/tarifas" className="text-sm font-semibold text-brand-strong underline">Cambiar</Link>}
      >
        <p className="px-5 py-4 text-sm">
          {moto
            ? `Banderazo ${pesos(moto.base)} + ${pesos(moto.per_km)} por km · Un viaje de 5 km cuesta desde ${pesos(tripPrice(moto, 5))}`
            : "Cargando tarifa"}
        </p>
      </Panel>

      <Panel title="Conductores en moto" className="mt-6 overflow-hidden">
        {data?.drivers.length === 0 && <Empty title="Aún no hay motos registradas" detail="Al registrarse, el conductor elige si trabaja en auto o en moto." />}
        {(data?.drivers.length ?? 0) > 0 && (
          <ul>
            {data?.drivers.map((driver) => (
              <li key={driver.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{driver.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {driver.vehicle} · {driver.plate} · {driver.rating.toFixed(1)} ★
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  {driver.verification_status !== "approved" && <Badge status={driver.verification_status} />}
                  <Badge status={driver.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Viajes en moto recientes" className="mt-6 overflow-hidden">
        {rides.data?.length === 0 && <Empty title="Todavía no hay viajes en moto" />}
        {(rides.data?.length ?? 0) > 0 && (
          <ul>
            {rides.data?.slice(0, 30).map((ride) => (
              <li key={ride.id} className="grid gap-2 border-b border-line px-5 py-3 text-sm last:border-0 md:grid-cols-[1fr_180px_auto_auto] md:items-center md:gap-4">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{splitLabel(ride.destination_label).place}</span>
                  <span className="block truncate text-xs text-muted">desde {splitLabel(ride.origin_label).place} · {when(ride.created_at)}</span>
                </span>
                <PersonCell person={ride.driver} />
                <Badge status={ride.status} />
                <span className="font-bold tabular-nums md:text-right">{pesos(ride.fare_amount ?? ride.estimated_fare)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
