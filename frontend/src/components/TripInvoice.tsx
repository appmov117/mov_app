import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button.tsx";
import { Stars } from "./ui/stars.tsx";
import { km, minutes, payLabel, pesos } from "../lib/format.ts";

export type InvoiceRide = {
  id: string;
  origin_label?: string | null;
  destination_label?: string | null;
  fare_amount: number | null;
  estimated_fare?: number | null;
  distance_m?: number | null;
  estimated_distance_m?: number | null;
  duration_s?: number | null;
  estimated_duration_s?: number | null;
  payment_method?: string | null;
  passenger?: { name: string } | null;
  driver?: { name: string } | null;
  passenger_rating?: { rating: number; comment: string | null } | null;
  driver_rating?: { rating: number; comment: string | null } | null;
  rating?: { rating: number; comment: string | null } | null;
};

type Props = {
  ride: InvoiceRide;
  role: "passenger" | "driver";
  dark?: boolean;
  onRated?: () => void;
  onDone: () => void;
  submit: (payload: { rating: number; comment: string }) => Promise<unknown>;
};

export function TripInvoice({ ride, role, dark = false, onRated, onDone, submit }: Props) {
  const mine = role === "passenger" ? ride.passenger_rating ?? ride.rating : ride.driver_rating;
  const [score, setScore] = useState(mine?.rating ?? 5);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(Boolean(mine));
  const counterpart = role === "passenger" ? ride.driver?.name ?? "Conductor" : ride.passenger?.name ?? "Pasajero";
  const total = ride.fare_amount ?? ride.estimated_fare;
  const shell = dark ? "bg-surface-dark text-white" : "bg-surface text-ink";
  const muted = dark ? "text-white/50" : "text-muted";
  const starOn = dark ? "text-[#F2C14E]" : "text-star";
  const starOff = dark ? "text-white/25" : "text-ink/25";
  const input = dark ? "bg-white/10 border-white/10 text-white placeholder:text-white/40" : "border-line bg-surface text-ink";

  async function send() {
    setPending(true);
    setError("");
    try {
      await submit({ rating: score, comment: comment.trim() });
      setDone(true);
      onRated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la calificación");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8 ${shell}`}>
      <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${dark ? "bg-ok" : "bg-ok text-white"}`}>
        <Check size={32} />
      </div>
      <h1 className="mt-4 text-center text-2xl font-extrabold">Recibo del viaje</h1>
      <p className={`mt-1 text-center text-sm ${muted}`}>{role === "passenger" ? "Pagado directo al conductor" : "Cobro registrado"}</p>
      <p className="mt-5 text-center text-4xl font-extrabold">{pesos(total)}</p>
      <dl className="mt-6 space-y-3 text-sm">
        <Row label="Origen" value={ride.origin_label?.split(",")[0] ?? "Origen"} muted={muted} />
        <Row label="Destino" value={ride.destination_label?.split(",")[0] ?? "Destino"} muted={muted} />
        <Row label="Distancia" value={km(ride.distance_m ?? ride.estimated_distance_m)} muted={muted} />
        <Row label="Tiempo" value={minutes(ride.duration_s ?? ride.estimated_duration_s)} muted={muted} />
        <Row label="Pago" value={payLabel(ride.payment_method)} muted={muted} />
        <Row label={role === "passenger" ? "Conductor" : "Pasajero"} value={counterpart} muted={muted} />
      </dl>

      {!done ? (
        <>
          <p className="mt-8 text-center text-sm font-semibold">Califica a {counterpart.split(" ")[0]}</p>
          <Stars value={score} onChange={setScore} size={30} on={starOn} off={starOff} className="mt-2 justify-center gap-2" />
          <textarea
            className={`mt-4 w-full rounded-2xl border p-3 text-sm ${input}`}
            rows={3}
            value={comment}
            placeholder="Agrega un comentario (opcional)"
            onChange={(event) => setComment(event.target.value)}
          />
          {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
          <Button className="mt-4" disabled={pending || score < 1} onClick={() => void send()}>
            {pending ? "Enviando" : "Enviar calificación"}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-8 text-center text-sm font-semibold">Tu calificación</p>
          <Stars value={score} on={starOn} off={starOff} className="mt-2 justify-center" />
          {comment && <p className={`mt-3 text-center text-sm ${muted}`}>“{comment}”</p>}
          <Button className={`mt-6 ${dark ? "bg-surface text-ink hover:bg-white/90" : ""}`} onClick={onDone}>
            Volver al inicio
          </Button>
        </>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className={muted}>{label}</dt>
      <dd className="max-w-[60%] text-right font-semibold">{value}</dd>
    </div>
  );
}
