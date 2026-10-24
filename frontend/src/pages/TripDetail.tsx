import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LifeBuoy, ReceiptText, ShieldAlert, Star, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { TripReceipt } from "../components/TripReceipt.tsx";
import { RouteMap, Timeline, type TripRide } from "../components/trip.tsx";
import { Button } from "../components/ui/button.tsx";
import { Loading } from "../components/ui/loading.tsx";
import { Stars } from "../components/ui/stars.tsx";
import { api } from "../lib/api.ts";
import { initials, pesos, splitLabel, statusLabel, when } from "../lib/format.ts";

type Role = "passenger" | "driver";
type Complaint = { ride_id: string; category: string; status: string };

const driverCategories = [
  { id: "behavior", label: "Trato" },
  { id: "fare", label: "Cobro o pago" },
  { id: "no_show", label: "No se presentó" },
  { id: "damage", label: "Daños al vehículo" },
  { id: "other", label: "Otro" },
] as const;

const categories = [
  { id: "fare", label: "Cobro" },
  { id: "route", label: "Ruta" },
  { id: "driving", label: "Forma de manejar" },
  { id: "behavior", label: "Trato" },
  { id: "vehicle", label: "Vehículo" },
  { id: "other", label: "Objeto perdido u otro" },
] as const;

export function TripDetail({ role }: { role: Role }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const showReceipt = params.has("recibo");
  const ride = useQuery({ queryKey: ["ride", id], queryFn: () => api<TripRide>(`/api/v1/rides/${id}`) });
  const listPath = role === "passenger" ? "/pasajero/historial" : "/conductor/viajes";

  return (
    <Shell nav={false}>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center bg-white px-2">
        <button
          type="button"
          aria-label={showReceipt ? "Volver al detalle" : "Cerrar"}
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-foam"
          onClick={() => (showReceipt ? setParams({}, { replace: true }) : navigate(listPath))}
        >
          {showReceipt ? <ChevronLeft size={22} /> : <X size={22} />}
        </button>
        {!showReceipt && <p className="flex-1 pr-10 text-center font-bold">Detalles del viaje</p>}
      </header>

      {ride.isLoading && <Loading label="Cargando viaje" />}
      {ride.error && <p className="p-6 text-sm text-danger">{(ride.error as Error).message}</p>}
      {ride.data &&
        (showReceipt ? (
          <TripReceipt ride={ride.data} role={role} />
        ) : (
          <Detail ride={ride.data} role={role} onReceipt={() => setParams({ recibo: "1" })} />
        ))}
    </Shell>
  );
}

function Detail({ ride, role, onReceipt }: { ride: TripRide; role: Role; onReceipt: () => void }) {
  const passenger = role === "passenger";
  const counterpart = (passenger ? ride.driver?.name : ride.passenger?.name) ?? (passenger ? "tu conductor" : "tu pasajero");
  const { service } = splitLabel(ride.destination_label);
  const vehicle = ride.driver?.vehicle;
  const completed = ride.status === "completed";

  return (
    <div className="px-4 pb-8">
      <RouteMap ride={ride} />

      <div className="mt-5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-2xl font-extrabold leading-tight tracking-tight">
            Viaje {service ?? "Auto"} con {counterpart}
          </h1>
          <p className="mt-2 text-sm text-ink/65">{when(ride.created_at)}</p>
          <p className="text-sm text-ink/65">
            {pesos(ride.fare_amount ?? ride.estimated_fare)}
            {passenger && vehicle ? ` · ${vehicle.brand} ${vehicle.model}, ${vehicle.plate}` : ""}
          </p>
          {!completed && (
            <span className="mt-2 inline-block rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger">
              {statusLabel(ride.status)}
            </span>
          )}
        </div>
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-foam text-xl font-extrabold text-ink">
          {initials(counterpart)}
        </span>
      </div>

      {completed && (
        <Button variant="line" className="mt-4 w-auto" onClick={onReceipt}>
          <ReceiptText size={18} aria-hidden="true" /> Recibo
        </Button>
      )}

      <div className="mt-4">
        <Timeline ride={ride} />
      </div>

      {completed && <RatingRow ride={ride} role={role} counterpart={counterpart} />}
      <Help ride={ride} role={role} />
    </div>
  );
}

function RatingRow({ ride, role, counterpart }: { ride: TripRide; role: Role; counterpart: string }) {
  const queryClient = useQueryClient();
  const mine = role === "passenger" ? ride.passenger_rating : ride.driver_rating;
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const rate = useMutation({
    mutationFn: () =>
      api(`/api/v1/rides/${ride.id}/rating`, { method: "POST", body: JSON.stringify({ rating: score, comment: comment.trim() || null }) }),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ride", ride.id] });
    },
  });

  return (
    <div className="border-t border-line py-4">
      <div className="flex items-center gap-4">
        <Star size={22} className="shrink-0 text-ink/70" aria-hidden="true" />
        {mine ? (
          <div className="flex-1">
            <p className="text-sm font-semibold">Tu calificación</p>
            <Stars value={mine.rating} size={16} className="mt-1" />
            {mine.comment && <p className="mt-1 text-xs text-muted">“{mine.comment}”</p>}
          </div>
        ) : (
          <>
            <p className="flex-1 font-semibold">Sin calificación</p>
            {!open && (
              <Button variant="line" size="sm" className="w-auto" onClick={() => setOpen(true)}>
                Calificar
              </Button>
            )}
          </>
        )}
      </div>
      {open && !mine && (
        <div className="mt-3 pl-10">
          <p className="text-sm text-ink/65">¿Cómo estuvo tu viaje con {counterpart.split(" ")[0]}?</p>
          <Stars value={score} onChange={setScore} size={30} className="mt-2 gap-2" />
          <textarea
            rows={2}
            maxLength={500}
            value={comment}
            placeholder="Comentario (opcional)"
            className="mt-3 w-full rounded-2xl border border-line p-3 text-sm outline-none focus:border-ink"
            onChange={(event) => setComment(event.target.value)}
          />
          {rate.error && <p className="mt-1 text-sm text-danger">{(rate.error as Error).message}</p>}
          <div className="mt-2 flex gap-2">
            <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={rate.isPending} onClick={() => rate.mutate()}>
              {rate.isPending ? "Enviando" : "Enviar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Help({ ride, role }: { ride: TripRide; role: Role }) {
  const [form, setForm] = useState<"problem" | "safety" | null>(null);
  const complaints = useQuery({
    queryKey: [`${role}-complaints`],
    queryFn: () => api<Complaint[]>(role === "passenger" ? "/api/v1/passengers/me/complaints" : "/api/v1/drivers/me/complaints"),
  });
  const reported = complaints.data?.find((row) => row.ride_id === ride.id);
  const reportable = ["completed", "cancelled", "in_progress"].includes(ride.status);
  if (!reportable) return null;

  return (
    <section className="mt-4">
      <h2 className="text-xl font-extrabold tracking-tight">Ayuda y seguridad</h2>
      {reported ? (
        <div className="mt-3 rounded-2xl bg-foam p-4 text-sm">
          <p className="font-semibold">Reporte enviado</p>
          <p className="mt-1 text-muted">
            {reported.status === "open" ? "Lo estamos revisando. Te avisaremos en Mensajes." : "Tu reporte ya fue revisado."}
          </p>
        </div>
      ) : (
        <ul className="mt-1">
          <HelpRow
            icon={<LifeBuoy size={22} />}
            title="Reportar un problema"
            detail={role === "passenger" ? "Cobro, ruta, vehículo u objeto perdido" : "Trato, pago, no se presentó o daños"}
            open={form === "problem"}
            onToggle={() => setForm(form === "problem" ? null : "problem")}
          >
            <ReportForm rideId={ride.id} role={role} safety={false} />
          </HelpRow>
          <HelpRow
            icon={<ShieldAlert size={22} />}
            title="Informa un asunto de seguridad"
            detail="Lo revisamos de inmediato"
            open={form === "safety"}
            onToggle={() => setForm(form === "safety" ? null : "safety")}
          >
            <ReportForm rideId={ride.id} role={role} safety />
          </HelpRow>
        </ul>
      )}
    </section>
  );
}

function HelpRow({
  icon,
  title,
  detail,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" aria-expanded={open} className="flex w-full items-center gap-4 py-4 text-left" onClick={onToggle}>
        <span className="shrink-0 text-ink/70" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">{detail}</span>
        </span>
        <ChevronRight size={18} className={`shrink-0 text-ink/30 transition ${open ? "rotate-90" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="pb-4 pl-10">{children}</div>}
    </li>
  );
}

function ReportForm({ rideId, role, safety }: { rideId: string; role: Role; safety: boolean }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>(safety ? "safety" : "");
  const [description, setDescription] = useState("");
  const send = useMutation({
    mutationFn: () =>
      api(`/api/v1/rides/${rideId}/complaints`, {
        method: "POST",
        body: JSON.stringify({ category, description: description.trim() || null }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`${role}-complaints`] }),
  });

  return (
    <div>
      {safety ? (
        <p className="text-sm text-ink/65">
          Cuéntanos qué pasó. Si estás en peligro, llama al 911 primero.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(role === "passenger" ? categories : driverCategories).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${category === item.id ? "bg-ink text-white" : "bg-foam text-ink/70"}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        rows={3}
        maxLength={1000}
        value={description}
        placeholder={safety ? "Describe lo ocurrido" : "Agrega detalles (opcional)"}
        className="mt-3 w-full rounded-2xl border border-line p-3 text-sm outline-none focus:border-ink"
        onChange={(event) => setDescription(event.target.value)}
      />
      {send.error && <p className="mt-1 text-sm text-danger">{(send.error as Error).message}</p>}
      <Button
        size="sm"
        variant={safety ? "danger" : "default"}
        className="mt-2"
        disabled={!category || (safety && !description.trim()) || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? "Enviando" : "Enviar reporte"}
      </Button>
    </div>
  );
}
