import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Upload } from "lucide-react";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { pesos, when } from "../../lib/format.ts";

type Membership = {
  status: string;
  expires_at: string | null;
  days_remaining: number;
  price: number;
  payment_url: string;
  /** "half": ganó la mitad de precio por 10 pasajeros referidos en un mes. */
  discount: "half" | null;
};

type Payment = { id: string; amount: number; method: string | null; status: string; created_at: string };

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "En revisión", tone: "bg-[#fbbf5a]/15 text-[#fbbf5a]" },
  approved: { label: "Aprobado", tone: "bg-[#6ee7a0]/15 text-[#6ee7a0]" },
  rejected: { label: "Rechazado", tone: "bg-[#fb8199]/15 text-[#fb8199]" },
};

export function MembershipPage() {
  const queryClient = useQueryClient();
  const membership = useQuery({ queryKey: ["membership"], queryFn: () => api<Membership>("/api/v1/drivers/me/membership") });
  const pay = useMutation({
    mutationFn: () => api<{ payment_url: string }>("/api/v1/drivers/me/membership/payment", { method: "POST", body: "{}" }),
    onSuccess: (data) => {
      window.open(data.payment_url, "_blank", "noopener");
      queryClient.invalidateQueries({ queryKey: ["membership"] });
      queryClient.invalidateQueries({ queryKey: ["membership-payments"] });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api("/api/v1/drivers/me/membership/receipt", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["membership"] });
      queryClient.invalidateQueries({ queryKey: ["membership-payments"] });
    },
  });
  const history = useQuery({ queryKey: ["membership-payments"], queryFn: () => api<Payment[]>("/api/v1/drivers/me/membership/payments") });
  const data = membership.data;
  const active = data?.status === "active";
  const until = data?.expires_at
    ? new Date(data.expires_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <Shell>
      <div className="flex flex-1 flex-col bg-surface-dark px-5 py-6 text-white">
        <h1 className="text-[28px] font-extrabold">Tu membresía</h1>
        <div className="mt-5 rounded-3xl bg-surface-dark-raised p-4">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${active ? "bg-ok-soft text-ok-strong" : "bg-white/10 text-white"}`}>
            {active ? "Activa" : "Sin vigencia"}
          </span>
          <p className="mt-4 text-lg font-bold">Válida hasta {until}</p>
          <p className="text-sm text-white/55">{active ? `${data?.days_remaining ?? 0} días restantes` : "Renueva para recibir viajes"}</p>
        </div>
        <div className="mt-4 rounded-3xl bg-surface-dark-raised p-4">
          <p className="font-bold">Plan conductor</p>
          <p className="mt-1 text-lg font-extrabold">{pesos(data?.price ?? 200)} / 30 días</p>
          {data?.discount === "half" && (
            <p className="mt-1 text-sm font-semibold text-brand-bright">Mitad de precio en tu siguiente renovación por tus 10 referidos</p>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {["Recibe viajes ilimitados", "0% de comisión por viaje", "Soporte del piloto", "Estadísticas de tus viajes"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check size={16} className="text-brand-bright" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <button className="mt-5 h-12 rounded-full bg-brand-strong font-semibold text-white" onClick={() => pay.mutate()}>
          Renovar membresía
        </button>
        <label className="mt-3 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 text-sm font-semibold text-white/85">
          <Upload size={16} aria-hidden="true" />
          {upload.isPending ? "Subiendo comprobante" : "Subir comprobante de pago"}
          <input
            className="sr-only"
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
        {upload.isSuccess && <p className="mt-2 text-center text-sm text-brand-bright">Comprobante recibido. Lo revisamos y te avisamos.</p>}
        {upload.isError && <p className="mt-2 text-center text-sm text-[#ff8b9a]">{(upload.error as Error).message}</p>}

        <h2 className="mt-8 text-sm font-bold text-white/80">Historial de pagos</h2>
        {history.data?.length === 0 && <p className="mt-2 text-sm text-white/55">Aún no tienes pagos registrados.</p>}
        <ul className="mt-2 divide-y divide-white/10 rounded-2xl bg-surface-dark-raised">
          {history.data?.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{pesos(payment.amount)}</span>
                <span className="block truncate text-xs text-white/55">
                  {when(payment.created_at)} · {payment.method === "bank_transfer" ? "Comprobante" : "Mercado Pago"}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[payment.status]?.tone ?? "bg-white/10 text-white/70"}`}>
                {STATUS[payment.status]?.label ?? payment.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
