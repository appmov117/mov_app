import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Star } from "lucide-react";
import { useState } from "react";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { clock, km, pesos } from "../../lib/format.ts";

type Block = { rides: number; declared_amount: number; average_fare: number; connected_seconds: number; distance_m: number };
type Stats = { today: Block; week: Block; month: Block; rating: number; complaints_open: number };

const periods = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
] as const;

export function DriverStats() {
  const stats = useQuery({ queryKey: ["driver-stats"], queryFn: () => api<Stats>("/api/v1/drivers/me/statistics") });
  const [period, setPeriod] = useState<(typeof periods)[number]["id"]>("today");
  const data = stats.data;
  const block = data?.[period];

  return (
    <Shell>
      <div className="flex-1 bg-white px-4 py-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">Ganancias</h1>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-foam p-1" role="tablist" aria-label="Periodo">
          {periods.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={period === item.id}
              className={`rounded-full py-2 text-sm font-semibold transition ${period === item.id ? "bg-white text-ink shadow-sm" : "text-muted"}`}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section className="mt-4 rounded-3xl bg-marine p-5 text-white">
          <p className="text-sm text-white/65">Monto declarado</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{block ? pesos(block.declared_amount) : "—"}</p>
          <p className="mt-2 text-sm text-white/65">
            {block ? `${block.rides} ${block.rides === 1 ? "viaje" : "viajes"} · promedio ${pesos(block.average_fare)}` : "Cargando"}
          </p>
        </section>

        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Metric label="Tiempo conectado" value={block ? clock(block.connected_seconds) : "—"} hint="h:mm" />
          <Metric label="Distancia" value={block ? km(block.distance_m) : "—"} />
        </dl>

        <h2 className="mb-2 mt-6 text-sm font-bold text-ink">Reputación</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
            <Star size={20} className="shrink-0 text-star" fill="currentColor" aria-hidden="true" />
            <div>
              <p className="text-xl font-extrabold">{data ? data.rating.toFixed(1) : "—"}</p>
              <p className="text-xs text-muted">Calificación</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
            <AlertTriangle size={20} className={`shrink-0 ${data?.complaints_open ? "text-danger" : "text-ink/30"}`} aria-hidden="true" />
            <div>
              <p className="text-xl font-extrabold">{data?.complaints_open ?? "—"}</p>
              <p className="text-xs text-muted">Quejas abiertas</p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          El monto declarado es lo que registras al terminar cada viaje; el pasajero te paga directo.
        </p>
      </div>
    </Shell>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl bg-foam p-4">
      <dt className="text-xs text-muted">
        {label}
        {hint && <span className="text-ink/35"> ({hint})</span>}
      </dt>
      <dd className="text-2xl font-extrabold">{value}</dd>
    </div>
  );
}
