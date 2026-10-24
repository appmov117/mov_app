import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../../lib/api.ts";
import { percent, pesos } from "../../lib/format.ts";
import { Kpi, Page } from "./ui.tsx";

type Dashboard = {
  drivers_registered: number;
  drivers_online: number;
  memberships_active: number;
  passengers_active_week: number;
  requests_today: number;
  rides_completed_today: number;
  acceptance_rate: number | null;
  cancellation_rate: number | null;
  membership_revenue: number;
  declared_ride_volume: number;
  complaints_open: number;
  rides_per_active_driver_week: number | null;
  renewal_rate: number | null;
  expired_memberships: number;
  renewed_memberships: number;
};

export function Overview() {
  const dash = useQuery({ queryKey: ["admin"], queryFn: () => api<Dashboard>("/api/v1/admin/dashboard"), refetchInterval: 30_000 });
  const data = dash.data;
  const value = (number: number | null | undefined) => (number == null ? "—" : String(number));

  return (
    <Page title="Resumen" description="Indicadores de la operación. Se actualizan cada 30 segundos.">
      <Group title="Hoy">
        <Kpi label="Solicitudes" value={value(data?.requests_today)} />
        <Kpi label="Viajes completados" value={value(data?.rides_completed_today)} />
        <Kpi label="Aceptación" value={percent(data?.acceptance_rate)} note="Solicitudes que consiguieron conductor" />
        <Kpi label="Cancelaciones" value={percent(data?.cancellation_rate)} tone={(data?.cancellation_rate ?? 0) > 0.25 ? "bad" : undefined} />
      </Group>
      <Group title="Conductores y pasajeros">
        <Kpi label="Conductores registrados" value={value(data?.drivers_registered)} />
        <Kpi label="Conectados ahora" value={value(data?.drivers_online)} />
        <Kpi label="Viajes por conductor activo" value={data?.rides_per_active_driver_week?.toFixed(1) ?? "—"} note="Últimos 7 días" />
        <Kpi label="Pasajeros activos" value={value(data?.passengers_active_week)} note="Últimos 7 días" />
      </Group>
      <Group title="Negocio">
        <Kpi label="Ingresos por membresías" value={pesos(data?.membership_revenue)} tone="brand" />
        <Kpi label="Membresías vigentes" value={value(data?.memberships_active)} />
        <Kpi
          label="Renovación"
          value={data?.expired_memberships ? percent(data.renewal_rate) : "—"}
          note={data?.expired_memberships ? `${data.renewed_memberships} de ${data.expired_memberships} renovaron` : "Aún no vence ninguna"}
        />
        <Kpi label="Valor declarado de viajes" value={pesos(data?.declared_ride_volume)} note="Lo cobra el conductor, no la plataforma" />
      </Group>
    </Page>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-bold text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
