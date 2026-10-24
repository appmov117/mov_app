import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { pesos, when } from "../../lib/format.ts";
import { Badge, Empty, FilePreview, Kpi, Page, Panel, PAYMENT_METHOD, type Person } from "./ui.tsx";

type Payment = {
  id: string;
  driver_name: string;
  amount: number;
  status: string;
  payment_method: string | null;
  reference: string | null;
  receipt_url: string | null;
  created_at: string | null;
};

type Overview = {
  active: number;
  expiring: number;
  expired: number;
  pending: number;
  without: number;
  revenue_month: number;
  items: (NonNullable<Person> & { membership: { status: string; days_remaining: number; expires_at: string | null } })[];
};

export function Memberships() {
  const overview = useQuery({ queryKey: ["admin-memberships"], queryFn: () => api<Overview>("/api/v1/admin/memberships") });
  const payments = useQuery({ queryKey: ["admin-payments"], queryFn: () => api<Payment[]>("/api/v1/admin/payments") });
  const pending = (payments.data ?? []).filter((payment) => payment.status === "pending");
  const history = (payments.data ?? []).filter((payment) => payment.status !== "pending").slice(0, 12);
  const data = overview.data;

  return (
    <Page title="Membresías y pagos" description="Cada conductor paga $200 MXN por 30 días. Aprueba aquí los pagos para activar su membresía; el conductor recibe un aviso.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Vigentes" value={String(data?.active ?? "—")} />
        <Kpi label="Vencen en 3 días o menos" value={String(data?.expiring ?? "—")} tone={data?.expiring ? "warn" : undefined} />
        <Kpi label="Vencidas" value={String(data?.expired ?? "—")} tone={data?.expired ? "bad" : undefined} />
        <Kpi label="Pagos por revisar" value={String(pending.length)} tone={pending.length ? "warn" : undefined} />
        <Kpi label="Ingresos del mes" value={pesos(data?.revenue_month)} note="Pagos aprobados este mes" />
      </div>

      <Panel title="Pagos por aprobar" className="mt-6">
        {pending.length === 0 && <Empty title="No hay pagos pendientes" detail="Cuando un conductor registra un pago, aparece aquí con su comprobante." />}
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {pending.map((payment) => <PendingPayment key={payment.id} payment={payment} />)}
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel title="Estado por conductor">
          {data?.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{item.name}</span>
                <span className="block truncate text-xs text-muted">{item.plate ?? item.phone}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {item.membership.status === "active" && <span className="text-xs text-muted tabular-nums">{item.membership.days_remaining} días</span>}
                <Badge status={item.membership.status} label={item.membership.status === "pending" ? "Pago por revisar" : undefined} />
              </span>
            </div>
          ))}
        </Panel>
        <Panel title="Pagos revisados">
          {history.length === 0 && <Empty title="Sin pagos revisados" />}
          {history.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{payment.driver_name}</span>
                <span className="block truncate text-xs text-muted">{when(payment.created_at)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-semibold tabular-nums">{pesos(payment.amount)}</span>
                <Badge status={payment.status} />
              </span>
            </div>
          ))}
        </Panel>
      </div>
    </Page>
  );
}

function PendingPayment({ payment }: { payment: Payment }) {
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (path: "approve" | "reject") => api(`/api/v1/admin/payments/${payment.id}/${path}`, { method: "POST" }),
    onSuccess: () => {
      for (const key of ["admin-payments", "admin-memberships", "admin-counts", "admin"]) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  return (
    <article className="rounded-2xl border border-line p-3">
      {payment.receipt_url ? (
        <FilePreview path={payment.receipt_url} alt={`Comprobante de ${payment.driver_name}`} />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-xl bg-foam px-4 text-center text-sm text-muted">
          Sin comprobante adjunto{payment.reference ? ` · referencia ${payment.reference}` : ""}
        </div>
      )}
      <div className="px-1 pt-3">
        <p className="font-bold">{payment.driver_name}</p>
        <p className="text-sm text-muted">
          {pesos(payment.amount)} · {PAYMENT_METHOD[payment.payment_method ?? ""] ?? payment.payment_method ?? "—"} · {when(payment.created_at)}
        </p>
        {act.error && <p className="mt-1 text-xs text-danger">{(act.error as Error).message}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="line" disabled={act.isPending} onClick={() => act.mutate("reject")}>Rechazar</Button>
          <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("approve")}>Aprobar</Button>
        </div>
      </div>
    </article>
  );
}
