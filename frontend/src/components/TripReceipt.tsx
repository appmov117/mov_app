import { Banknote, Car, CreditCard, Package, Star, Wallet } from "lucide-react";
import { RouteMap, Timeline, type TripRide } from "./trip.tsx";
import { clockTime, km, minutes, payLabel, pesos, splitLabel, when } from "../lib/format.ts";

type Props = { ride: TripRide; role: "passenger" | "driver" };

export function TripReceipt({ ride, role }: Props) {
  const passenger = role === "passenger";
  const me = (passenger ? ride.passenger?.name : ride.driver?.name) ?? "";
  const { service } = splitLabel(ride.destination_label);
  const total = ride.fare_amount ?? ride.estimated_fare;
  const adjustment = ride.fare_amount != null && ride.estimated_fare != null ? ride.fare_amount - ride.estimated_fare : 0;
  const finished = ride.completed_at ?? ride.created_at;
  const PayIcon = ride.payment_method === "driver_terminal" ? CreditCard : ride.payment_method === "other" ? Wallet : Banknote;
  const ServiceIcon = service === "Paquete" ? Package : Car;

  return (
    <div className="pb-8">
      <h1 className="px-4 pt-2 text-[28px] font-extrabold tracking-tight">Recibo</h1>

      <section className="mt-4 bg-foam px-4 py-6">
        <p className="text-lg font-extrabold text-brand-strong">Ruta</p>
        <p className="mt-4 text-xs text-muted">{when(finished)}</p>
        <h2 className="mt-1 text-balance text-3xl font-extrabold leading-tight tracking-tight">
          {passenger ? `Gracias por viajar con Ruta, ${firstName(me)}` : `Resumen de tu viaje, ${firstName(me)}`}
        </h2>
        <p className="mt-3 text-sm text-ink/65">
          {passenger ? `Esperamos que hayas disfrutado tu viaje${dayPart(finished)}.` : "Gracias por conducir con Ruta."}
        </p>
      </section>

      <section className="px-4">
        <div className="flex items-baseline justify-between border-b border-line py-5">
          <span className="text-2xl font-extrabold">Total</span>
          <span className="text-2xl font-extrabold">{pesos(total)}</span>
        </div>
        <dl className="space-y-4 border-b border-line py-5 text-sm">
          <Line label="Tarifa estimada" value={pesos(ride.estimated_fare)} />
          {adjustment !== 0 && (
            <Line
              label="Ajuste al cerrar el viaje"
              value={`${adjustment < 0 ? "-" : "+"}${pesos(Math.abs(adjustment))}`}
              tone={adjustment < 0 ? "text-ok-strong" : undefined}
            />
          )}
          {!passenger && <Line label="Comisión de Ruta" value={pesos(0)} hint="Tu membresía cubre el uso de la app." />}
        </dl>

        <h3 className="mt-6 text-xl font-extrabold">Pago</h3>
        <div className="flex items-center gap-3 border-b border-line py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foam text-ink/70">
            <PayIcon size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{payLabel(ride.payment_method)}</span>
            <span className="block text-xs text-muted">
              {passenger ? "Pagado directo al conductor" : "Cobrado directo al pasajero"}
              {clockTime(ride.completed_at) ? ` · ${clockTime(ride.completed_at)}` : ""}
            </span>
          </span>
          <span className="font-extrabold">{pesos(total)}</span>
        </div>
        <p className="border-b border-line py-4 text-xs leading-relaxed text-muted">
          Ruta no procesa pagos. El cobro se hace directo con el conductor, en efectivo o en su terminal.
        </p>

        <h3 className="mt-6 text-xl font-extrabold">Detalles del viaje</h3>
        <div className="flex items-center gap-3 border-b border-line py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foam text-ink/70">
            <ServiceIcon size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">{service ?? "Auto"}</span>
            <span className="block text-xs text-muted">
              {km(ride.distance_m ?? ride.estimated_distance_m)} · {minutes(ride.duration_s ?? ride.estimated_duration_s)}
            </span>
          </span>
        </div>
        <div className="py-2">
          <Timeline ride={ride} />
        </div>
        <RouteMap ride={ride} className="h-56" />

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-line px-4 py-4">
          <span className="font-semibold">
            {passenger ? `Viajaste con ${ride.driver?.name ?? "tu conductor"}` : `Llevaste a ${ride.passenger?.name ?? "tu pasajero"}`}
          </span>
          {passenger && ride.driver && (
            <span className="inline-flex items-center gap-1 font-semibold">
              {ride.driver.rating.toFixed(1)}
              <Star size={16} className="text-star" fill="currentColor" aria-hidden="true" />
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function Line({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </dt>
      <dd className={`font-semibold ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

function firstName(name: string) {
  return name.split(" ")[0] ?? "";
}

function dayPart(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (date.toDateString() !== new Date().toDateString()) return "";
  const hour = date.getHours();
  if (hour < 12) return " de esta mañana";
  if (hour < 19) return " de esta tarde";
  return " de esta noche";
}
