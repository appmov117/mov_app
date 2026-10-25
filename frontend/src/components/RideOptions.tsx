import { Minus, Plus, TrendingUp } from "lucide-react";
import { Field, Input } from "./ui/input.tsx";
import { pesos } from "../lib/format.ts";

export type PackageDetails = { description: string; recipient_name: string; recipient_phone: string };

export const EMPTY_PACKAGE: PackageDetails = { description: "", recipient_name: "", recipient_phone: "" };

export function packageReady(details: PackageDetails) {
  return details.description.trim().length >= 2 && details.recipient_name.trim().length >= 2 && /^\d{10}$/.test(details.recipient_phone);
}

/** Hora local a la que se llegaría si el viaje sale ahora, p. ej. "9:00 a. m.". */
export function arrivalClock(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

/** Aviso de recargo por horario o tarifa especial, como "Tarifas más altas de lo normal". */
export function SurchargeNotice({ surcharge }: { surcharge: { percent: number; label: string | null } | null | undefined }) {
  if (!surcharge) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-warn">
      <TrendingUp size={16} aria-hidden="true" />
      Tarifas más altas de lo normal · {surcharge.label ?? "Recargo"} +{surcharge.percent} %
    </p>
  );
}

/** Qué se envía y a quién: el conductor lo ve al aceptar y quien recibe da el código de entrega. */
export function PackageForm({ value, onChange }: { value: PackageDetails; onChange: (value: PackageDetails) => void }) {
  const set = (key: keyof PackageDetails, text: string) => onChange({ ...value, [key]: text });
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-line p-3">
      <Field label="¿Qué envías?">
        <Input value={value.description} maxLength={140} placeholder="Sobre con documentos" onChange={(event) => set("description", event.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Quién recibe">
          <Input value={value.recipient_name} maxLength={80} onChange={(event) => set("recipient_name", event.target.value)} />
        </Field>
        <Field label="Su teléfono">
          <Input
            inputMode="numeric"
            value={value.recipient_phone}
            placeholder="10 dígitos"
            onChange={(event) => set("recipient_phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        </Field>
      </div>
      <p className="text-xs text-muted">Al pedir te damos un código de 4 dígitos: compártelo con quien recibe. El conductor lo pide al entregar y toma una foto.</p>
    </div>
  );
}

/** "Pon tu precio": desde 20 % menos que la tarifa mínima; el conductor decide si acepta. */
export function OfferPrice({ minimum, value, onChange }: { minimum: number; value: number | null; onChange: (value: number | null) => void }) {
  const floor = Math.ceil(minimum * 0.8);
  if (value == null) {
    return (
      <button type="button" className="mt-3 w-full text-center text-sm font-semibold text-brand-strong underline" onClick={() => onChange(Math.round(minimum))}>
        Pon tu precio
      </button>
    );
  }
  const below = value < minimum;
  return (
    <div className="mt-3 rounded-2xl border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Tu precio</span>
        <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => onChange(null)}>
          Usar tarifa
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Bajar precio"
          className="grid h-10 w-10 place-items-center rounded-full border border-line disabled:opacity-30"
          disabled={value <= floor}
          onClick={() => onChange(Math.max(floor, value - 5))}
        >
          <Minus size={18} />
        </button>
        <label className="text-center">
          <span className="sr-only">Precio que ofreces en pesos</span>
          <span className="flex items-center justify-center text-2xl font-extrabold">
            $
            <input
              type="number"
              inputMode="numeric"
              min={floor}
              max={10000}
              className="w-24 bg-transparent text-center outline-none"
              value={value || ""}
              onChange={(event) => onChange(Math.min(10000, Math.max(0, Math.round(Number(event.target.value)))))}
            />
          </span>
        </label>
        <button
          type="button"
          aria-label="Subir precio"
          className="grid h-10 w-10 place-items-center rounded-full border border-line"
          onClick={() => onChange(Math.min(10000, Math.max(floor, value) + 5))}
        >
          <Plus size={18} />
        </button>
      </div>
      <p className={`mt-1 text-center text-xs ${value < floor ? "text-danger" : below ? "text-warn" : "text-muted"}`}>
        {value < floor
          ? `Lo mínimo que puedes ofrecer es ${pesos(floor)}`
          : below
            ? "Menos que la tarifa: puede tardar más en aceptarse"
            : `Tarifa mínima ${pesos(minimum)}`}
      </p>
    </div>
  );
}
