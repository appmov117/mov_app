import { Car, Flag } from "lucide-react";
import { km } from "../lib/format.ts";
import { useLegTotal } from "../lib/routeLeg.ts";

type Props = {
  /** Metros que faltan, medidos sobre la ruta por calles. */
  remaining: number;
  /** Identifica el tramo (viaje, fase y meta): al cambiar, el total se vuelve a medir. */
  leg: string;
  /** Segundos estimados para llegar, si se conocen. */
  eta?: number | null;
  /** Hacia dónde va el tramo: "Recogida", "Destino", "Parada 2". */
  target: string;
  /** Barra más corta para mapas con poco espacio visible. */
  compact?: boolean;
  className?: string;
};

/**
 * Barra vertical de avance, orientada como la ruta en el mapa: la meta arriba, la salida
 * abajo y el auto subiendo conforme se acerca. El tramo recorrido se pinta en verde.
 */
export function TripProgress({ remaining, leg, eta, target, compact = false, className = "" }: Props) {
  const total = useLegTotal(leg, remaining);
  if (total <= 0) return null;
  const done = Math.min(1, Math.max(0, 1 - remaining / total));
  const minutes = eta != null ? Math.max(1, Math.round(eta / 60)) : null;
  return (
    <div
      className={`flex w-16 flex-col items-center rounded-2xl bg-white/95 px-1.5 py-2.5 text-ink shadow-lg backdrop-blur ${className}`}
      role="progressbar"
      aria-label={`Faltan ${km(remaining)} para ${target.toLowerCase()}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(done * 100)}
    >
      <Flag size={16} className="text-ink" aria-hidden="true" />
      <span className="mt-0.5 text-center text-[11px] font-semibold leading-tight">{target}</span>
      {minutes != null && <span className="text-center text-[11px] leading-tight text-muted">{minutes} min</span>}
      <span className={`relative my-3 w-2 rounded-full bg-ink/10 ${compact ? "h-24" : "h-48"}`}>
        <span className="absolute inset-x-0 bottom-0 rounded-full bg-ok transition-[height] duration-700 ease-out" style={{ height: `${done * 100}%` }} />
        <span
          className="absolute left-1/2 grid h-7 w-7 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border-2 border-white bg-ok text-white shadow transition-[bottom] duration-700 ease-out"
          style={{ bottom: `${done * 100}%` }}
          aria-hidden="true"
        >
          <Car size={14} strokeWidth={2.5} />
        </span>
      </span>
      <span className="text-center text-[11px] leading-tight text-muted">Faltan</span>
      <span className="text-center text-sm font-extrabold leading-tight tabular-nums">{km(remaining)}</span>
    </div>
  );
}
