import { Copy, CreditCard, Landmark, Luggage, PawPrint, Share2, ShieldCheck, Snowflake, type LucideIcon } from "lucide-react";
import { useState } from "react";

export type Amenities = { pets: boolean; ac: boolean; luggage: boolean; card: boolean; transfer: boolean };
export type Payout = { clabe: string; bank: string; holder: string };
export type PackageInfo = { description: string; recipient_name: string; recipient_phone: string };

export const AMENITY_LIST: { id: keyof Amenities; icon: LucideIcon; yes: string; no: string }[] = [
  { id: "pets", icon: PawPrint, yes: "Acepta mascotas", no: "No acepta mascotas" },
  { id: "ac", icon: Snowflake, yes: "Con aire acondicionado", no: "Sin aire acondicionado" },
  { id: "luggage", icon: Luggage, yes: "Lleva equipaje grande", no: "Sin espacio para equipaje grande" },
  { id: "card", icon: CreditCard, yes: "Acepta tarjeta", no: "No acepta tarjeta" },
  { id: "transfer", icon: Landmark, yes: "Acepta transferencia", no: "No acepta transferencia" },
];

/** Lo que acepta el conductor, solo con iconos: verde si sí, rojo si no. */
export function AmenityIcons({ amenities, className = "" }: { amenities: Amenities | null | undefined; className?: string }) {
  if (!amenities) return null;
  return (
    <ul className={`flex gap-1.5 ${className}`} aria-label="Lo que acepta el conductor">
      {AMENITY_LIST.map(({ id, icon: Icon, yes, no }) => {
        const on = amenities[id];
        return (
          <li
            key={id}
            title={on ? yes : no}
            aria-label={on ? yes : no}
            className={`grid h-8 w-8 place-items-center rounded-full ${on ? "bg-ok/15 text-ok" : "bg-danger/10 text-danger"}`}
          >
            <Icon size={16} aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}

function Digits({ code }: { code: string }) {
  return (
    <span className="flex gap-1.5" aria-label={code.split("").join(" ")}>
      {code.split("").map((digit, index) => (
        <span key={index} className="grid h-10 w-9 place-items-center rounded-lg bg-surface text-xl font-extrabold tabular-nums shadow-sm">
          {digit}
        </span>
      ))}
    </span>
  );
}

/** Código que el pasajero da al conductor para que pueda iniciar el viaje. */
export function StartPin({ pin }: { pin: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-bold text-brand-strong">
          <ShieldCheck size={16} aria-hidden="true" /> Código de seguridad
        </span>
        <span className="block text-xs text-muted">Dáselo al conductor al subir</span>
      </span>
      <Digits code={pin} />
    </div>
  );
}

/** Código de entrega del paquete: el remitente lo comparte con quien recibe. */
export function DeliveryCode({ code, parcel }: { code: string; parcel: PackageInfo | null }) {
  const message = `Hola ${parcel?.recipient_name ?? ""}, te envío un paquete con Ruta. Cuando llegue, dale al conductor este código de entrega: ${code}`;
  return (
    <div className="mt-3 rounded-2xl bg-brand-soft px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-brand-strong">Código de entrega</span>
          <span className="block truncate text-xs text-muted">Para {parcel?.recipient_name ?? "quien recibe"}</span>
        </span>
        <Digits code={code} />
      </div>
      {parcel && (
        <a
          href={`https://wa.me/52${parcel.recipient_phone}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full bg-surface text-sm font-semibold"
        >
          <Share2 size={16} aria-hidden="true" /> Enviar código por WhatsApp
        </a>
      )}
    </div>
  );
}

/** Datos para pagar por transferencia directo al conductor. */
export function PayoutCard({ payout }: { payout: Payout }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-2xl border border-line px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <Landmark size={16} aria-hidden="true" /> Pago por transferencia
      </p>
      <p className="mt-1 text-xs text-muted">
        {payout.bank} · {payout.holder}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-base font-bold tracking-wider tabular-nums">{payout.clabe.replace(/(\d{4})(?=\d)/g, "$1 ")}</span>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded-full bg-foam px-3 py-1.5 text-xs font-semibold"
          onClick={() => void navigator.clipboard?.writeText(payout.clabe).then(() => setCopied(true))}
        >
          <Copy size={14} aria-hidden="true" /> {copied ? "Copiada" : "Copiar CLABE"}
        </button>
      </div>
    </div>
  );
}
