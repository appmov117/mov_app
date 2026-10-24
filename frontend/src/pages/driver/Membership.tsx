import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { pesos } from "../../lib/format.ts";

type Membership = {
  status: string;
  expires_at: string | null;
  days_remaining: number;
  price: number;
  payment_url: string;
};

export function MembershipPage() {
  const queryClient = useQueryClient();
  const membership = useQuery({ queryKey: ["membership"], queryFn: () => api<Membership>("/api/v1/drivers/me/membership") });
  const pay = useMutation({
    mutationFn: () => api<{ payment_url: string }>("/api/v1/drivers/me/membership/payment", { method: "POST", body: "{}" }),
    onSuccess: (data) => {
      window.open(data.payment_url, "_blank", "noopener");
      queryClient.invalidateQueries({ queryKey: ["membership"] });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api("/api/v1/drivers/me/membership/receipt", { method: "POST", body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["membership"] }),
  });
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
        <label className="mt-3 block text-center text-sm text-white/70">
          Historial de pagos
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
        {upload.isSuccess && <p className="mt-2 text-center text-sm text-brand-bright">Comprobante recibido.</p>}
      </div>
    </Shell>
  );
}
