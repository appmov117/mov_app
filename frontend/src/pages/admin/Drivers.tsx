import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { pesos, when } from "../../lib/format.ts";
import { DocumentCard, type DriverDocument } from "./Documents.tsx";
import { Badge, CATEGORY, Drawer, Empty, Field, Filters, Page, Panel, PAYMENT_METHOD } from "./ui.tsx";

type DriverRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  driver_status: string;
  verification_status: string;
  rating: number;
  completed_rides: number;
  membership: { status: string; days_remaining: number };
};

type DriverDetail = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  verification_status: string;
  driver_status: string;
  rating: number;
  vehicle: { brand: string; model: string; plate: string; color: string } | null;
  rides: { id: string; status: string; fare_amount: number | null; created_at: string | null }[];
  payments: { id: string; status: string; amount: number; payment_method: string | null; created_at: string | null }[];
  complaints: { id: string; category: string; status: string }[];
  referrals: number;
  cancelled_rides: number;
};

type Filter = "all" | "pending" | "online" | "suspended";

export function Drivers() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const drivers = useQuery({ queryKey: ["admin-drivers"], queryFn: () => api<DriverRow[]>("/api/v1/admin/drivers") });
  const rows = (drivers.data ?? []).filter((driver) => {
    if (filter === "pending") return driver.verification_status !== "approved";
    if (filter === "online") return driver.driver_status !== "offline";
    if (filter === "suspended") return driver.status === "suspended";
    return true;
  });
  const count = (test: (driver: DriverRow) => boolean) => (drivers.data ?? []).filter(test).length;

  return (
    <Page title="Conductores" description="Verifica a los conductores nuevos, revisa sus documentos y suspende cuentas cuando haga falta.">
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: "Todos", count: drivers.data?.length },
          { id: "pending", label: "Por verificar", count: count((driver) => driver.verification_status !== "approved") },
          { id: "online", label: "Conectados", count: count((driver) => driver.driver_status !== "offline") },
          { id: "suspended", label: "Suspendidos", count: count((driver) => driver.status === "suspended") },
        ]}
      />
      <Panel className="mt-4 overflow-hidden">
        {rows.length === 0 && drivers.isSuccess && <Empty title="No hay conductores en esta lista" />}
        {rows.length > 0 && (
          <>
          <ul className="md:hidden">
            {rows.map((driver) => (
              <li key={driver.id} className="border-b border-line last:border-0">
                <button type="button" className="block w-full px-4 py-3.5 text-left" onClick={() => setOpen(driver.id)}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{driver.name}</span>
                      <span className="block truncate text-xs text-muted">{driver.phone} · {driver.rating.toFixed(1)} ★ · {driver.completed_rides} viajes</span>
                    </span>
                    <Badge status={driver.driver_status} />
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {driver.status === "suspended" ? <Badge status="suspended" /> : <Badge status={driver.verification_status} label={driver.verification_status === "approved" ? "Verificado" : undefined} />}
                    <Badge status={driver.membership.status} label={driver.membership.status === "active" ? `Vigente · ${driver.membership.days_remaining} d` : driver.membership.status === "pending" ? "Pago por revisar" : undefined} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-foam text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Conductor</th>
                <th className="px-3 py-3 font-semibold">Verificación</th>
                <th className="px-3 py-3 font-semibold">Ahora</th>
                <th className="px-3 py-3 font-semibold">Membresía</th>
                <th className="px-3 py-3 text-right font-semibold">Calificación</th>
                <th className="px-5 py-3 text-right font-semibold">Viajes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((driver) => (
                <tr key={driver.id} className="cursor-pointer border-t border-line hover:bg-foam/60" onClick={() => setOpen(driver.id)}>
                  <td className="px-5 py-3">
                    <span className="block font-semibold">{driver.name}</span>
                    <span className="block text-xs text-muted">{driver.phone}</span>
                  </td>
                  <td className="px-3 py-3">
                    {driver.status === "suspended" ? <Badge status="suspended" /> : <Badge status={driver.verification_status} label={driver.verification_status === "approved" ? "Verificado" : undefined} />}
                  </td>
                  <td className="px-3 py-3"><Badge status={driver.driver_status} /></td>
                  <td className="px-3 py-3">
                    <Badge status={driver.membership.status} label={driver.membership.status === "pending" ? "Pago por revisar" : undefined} />
                    {driver.membership.status === "active" && <span className="ml-2 text-xs text-muted">{driver.membership.days_remaining} d</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{driver.rating.toFixed(1)} ★</td>
                  <td className="px-5 py-3 text-right tabular-nums">{driver.completed_rides}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Panel>
      {open && <DriverDrawer id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function DriverDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const driver = useQuery({ queryKey: ["admin-driver", id], queryFn: () => api<DriverDetail>(`/api/v1/admin/drivers/${id}`) });
  const docs = useQuery({
    queryKey: ["admin-documents", "driver", id],
    queryFn: () => api<DriverDocument[]>(`/api/v1/admin/documents?driver_id=${id}`),
  });
  const access = useMutation({
    mutationFn: (path: "activate" | "suspend") => api(`/api/v1/admin/drivers/${id}/${path}`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-driver", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-counts"] });
    },
  });
  const data = driver.data;
  const suspended = data?.status === "suspended";

  return (
    <Drawer title={data?.name ?? "Conductor"} onClose={onClose}>
      {!data && <p className="text-sm text-muted">Cargando conductor</p>}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {suspended ? <Badge status="suspended" /> : <Badge status={data.verification_status} label={data.verification_status === "approved" ? "Verificado" : undefined} />}
            <Badge status={data.driver_status} />
            <span className="text-sm text-muted">{data.rating.toFixed(1)} ★</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(suspended || data.verification_status !== "approved") && (
              <Button size="sm" disabled={access.isPending} onClick={() => access.mutate("activate")}>
                {suspended ? "Reactivar cuenta" : "Aprobar conductor"}
              </Button>
            )}
            {!suspended && (
              <Button size="sm" variant="danger" disabled={access.isPending} onClick={() => access.mutate("suspend")}>
                Suspender
              </Button>
            )}
          </div>
          <section>
            <h3 className="mb-1 font-bold">Contacto y vehículo</h3>
            <Field label="Teléfono"><a href={`tel:${data.phone}`} className="text-ink underline">{data.phone}</a></Field>
            <Field label="Correo">{data.email ?? "—"}</Field>
            <Field label="Vehículo">{data.vehicle ? `${data.vehicle.brand} ${data.vehicle.model}, ${data.vehicle.color}` : "—"}</Field>
            <Field label="Placa">{data.vehicle?.plate ?? "—"}</Field>
            <Field label="Viajes cancelados">{data.cancelled_rides}</Field>
            <Field label="Personas que invitó">{data.referrals}</Field>
          </section>
          <section>
            <h3 className="mb-2 font-bold">Documentos</h3>
            {docs.data?.length === 0 && <p className="rounded-xl bg-foam px-4 py-3 text-sm text-muted">Todavía no sube documentos.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {docs.data?.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
            </div>
          </section>
          <section>
            <h3 className="mb-1 font-bold">Pagos de membresía</h3>
            {data.payments.length === 0 && <p className="text-sm text-muted">Sin pagos registrados.</p>}
            {data.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
                <span>{pesos(payment.amount)} · {PAYMENT_METHOD[payment.payment_method ?? ""] ?? payment.payment_method ?? "—"} · <span className="text-muted">{when(payment.created_at)}</span></span>
                <Badge status={payment.status} />
              </div>
            ))}
          </section>
          <section>
            <h3 className="mb-1 font-bold">Viajes recientes</h3>
            {data.rides.length === 0 && <p className="text-sm text-muted">Sin viajes.</p>}
            {data.rides.slice(0, 6).map((ride) => (
              <div key={ride.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
                <span className="text-muted">{when(ride.created_at)}</span>
                <span className="flex items-center gap-3"><span className="font-semibold tabular-nums">{pesos(ride.fare_amount)}</span><Badge status={ride.status} /></span>
              </div>
            ))}
          </section>
          {data.complaints.length > 0 && (
            <section>
              <h3 className="mb-1 font-bold">Quejas sobre este conductor</h3>
              {data.complaints.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
                  <span>{CATEGORY[item.category] ?? item.category}</span>
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
