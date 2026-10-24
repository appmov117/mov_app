import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapView, type Pin } from "../../components/MapView.tsx";
import { prepareAlerts } from "../../components/DriverBeacon.tsx";
import { AlertsNotice, LocationNotice } from "../../components/DriverNotices.tsx";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { km, pesos } from "../../lib/format.ts";
import { useLiveInterval } from "../../lib/live.ts";
import { locateOnce, usePosition } from "../../lib/position.ts";

type Offer = {
  id: string;
  origin_label: string | null;
  destination_label: string | null;
  origin: Pin;
  destination: Pin;
  stops: Pin[];
  stop_count: number;
  pickup_distance_m: number | null;
  pickup_eta_s: number | null;
  pickup_by_road: boolean;
  /** La recogida es después de dejar al pasajero actual; el tiempo ya incluye lo que falta. */
  after_current_ride: boolean;
  trip_distance_m: number | null;
  estimated_fare: number | null;
  status: "pending" | "countered";
  min_counter_fare: number | null;
  max_counter_fare: number | null;
  proposed_fare: number | null;
  counter_expires_at: string | null;
};
type Me = { driver_status: string; verification_status: string; name: string; location: Pin | null };
type Membership = { status: string; days_remaining: number };

/** Centro de Mérida, mientras llega la primera lectura del GPS. */
const center: Pin = { latitude: 20.9674, longitude: -89.5926 };
const offerSeconds = 20;

export function DriverHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusInterval = useLiveInterval(8000);
  const offersInterval = useLiveInterval(3000);
  const me = useQuery({ queryKey: ["driver"], queryFn: () => api<Me>("/api/v1/drivers/me"), refetchInterval: statusInterval });
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api<Offer[]>("/api/v1/drivers/me/ride-offers"), refetchInterval: offersInterval });
  const membership = useQuery({ queryKey: ["membership"], queryFn: () => api<Membership>("/api/v1/drivers/me/membership") });
  const active = useQuery({ queryKey: ["driver-active"], queryFn: () => api<{ id: string } | null>("/api/v1/drivers/me/active"), refetchInterval: offersInterval });
  const [seconds, setSeconds] = useState(offerSeconds);
  const [counterAmount, setCounterAmount] = useState<number | null>(null);
  const gps = usePosition();
  // Sin lectura del GPS, la última ubicación guardada en el servidor mantiene el auto en el mapa.
  const here = gps ?? me.data?.location ?? null;
  const [focus, setFocus] = useState<Pin | null>(null);

  // Una lectura al abrir: si el conductor está desconectado no hay seguimiento que la traiga.
  useEffect(() => {
    void locateOnce().then((pin) => pin && setFocus({ ...pin }));
  }, []);

  const offer = offers.data?.[0];
  const online = me.data?.driver_status === "online" || me.data?.driver_status === "busy";

  // Con un viaje en curso solo se queda aquí para responder la oferta del viaje siguiente.
  useEffect(() => {
    if (active.data && !offer) navigate("/conductor/viaje");
  }, [active.data, offer, navigate]);

  useEffect(() => {
    setSeconds(offerSeconds);
    if (!offer) return;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [offer?.id]);

  const toggle = useMutation({
    mutationFn: () => api(online ? "/api/v1/drivers/me/offline" : "/api/v1/drivers/me/online", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["driver"] }),
  });
  const accept = useMutation({
    mutationFn: (id: string) => api(`/api/v1/ride-offers/${id}/accept`, { method: "POST" }),
    onSuccess: () => navigate("/conductor/viaje"),
  });
  const reject = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/ride-offers/${id}/reject`, { method: "POST", body: JSON.stringify({ pause_minutes: 5 }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });
  const counter = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api(`/api/v1/ride-offers/${id}/counter`, { method: "POST", body: JSON.stringify({ amount }) }),
    onSuccess: () => {
      setCounterAmount(null);
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });

  if (offer?.status === "countered") {
    return (
      <Shell nav={false} full>
        <CounterWaiting offer={offer} />
      </Shell>
    );
  }

  if (offer) {
    // El conductor puede proponer hasta 10 % menos o 10 % más que la tarifa estimada, en pesos enteros.
    const estimated = offer.estimated_fare;
    const minCounter = offer.min_counter_fare != null ? Math.ceil(offer.min_counter_fare) : null;
    const maxCounter = offer.max_counter_fare != null ? Math.floor(offer.max_counter_fare) : null;
    const canCounter = estimated != null && minCounter != null && maxCounter != null && maxCounter > minCounter;
    const sameAsEstimate = counterAmount != null && estimated != null && counterAmount === estimated;
    const difference = counterAmount != null && estimated != null ? counterAmount - estimated : 0;
    return (
      <Shell nav={false} full>
        <div className="flex min-h-0 flex-1 flex-col bg-surface-dark text-white md:px-[max(0px,calc((100%-36rem)/2))]">
          <div className="flex items-start justify-between gap-4 px-5 pt-6">
            <div>
              <h1 className="text-lg font-bold text-white/80">{offer.after_current_ride ? "Siguiente viaje" : "Nueva solicitud"}</h1>
              <p className="mt-1 text-5xl font-extrabold tracking-tight">{pesos(offer.estimated_fare)}</p>
              <p className="mt-1 text-sm text-white/70">
                Tarifa estimada · {km(offer.trip_distance_m)} de viaje
              </p>
            </div>
            <Countdown seconds={seconds} total={offerSeconds} />
          </div>
          <ol className="mx-5 mt-5 rounded-2xl bg-white/[0.06] px-4 py-3.5">
            <RouteStop color="bg-brand-bright" title="Recogida" place={offer.origin_label ?? "Punto de recogida"} detail={pickupDetail(offer)} line />
            {offer.stop_count > 0 && (
              <RouteStop
                color="bg-white/50"
                title={`${offer.stop_count} ${offer.stop_count === 1 ? "parada intermedia" : "paradas intermedias"}`}
                line
              />
            )}
            <RouteStop color="bg-[#f87171]" square title="Destino" place={offer.destination_label?.split(" · ")[0] ?? "Destino"} />
          </ol>
          <div className="relative mx-5 mt-4 min-h-[140px] flex-1 overflow-hidden rounded-2xl">
            <MapView center={offer.origin} origin={offer.origin} destination={offer.destination} stops={offer.stops} />
          </div>
          <div className="space-y-2 px-5 pb-6 pt-4">
            {(accept.error || counter.error) && (
              <p className="text-sm text-[#F2C14E]">{((accept.error ?? counter.error) as Error).message}</p>
            )}
            {counterAmount != null && canCounter ? (
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-white/70">
                  Tu precio, de {pesos(minCounter)} a {pesos(maxCounter)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    aria-label="Bajar precio"
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/25 text-xl font-bold disabled:opacity-30"
                    disabled={counterAmount <= minCounter}
                    onClick={() => setCounterAmount(Math.max(minCounter, counterAmount - 1))}
                  >
                    −
                  </button>
                  <span className="text-center" aria-live="polite">
                    <span className="block text-3xl font-extrabold">{pesos(counterAmount)}</span>
                    <span className={`block text-xs font-semibold ${difference > 0 ? "text-[#86efac]" : difference < 0 ? "text-[#F2C14E]" : "text-white/70"}`}>
                      {difference === 0
                        ? "Igual a la tarifa estimada"
                        : `${difference > 0 ? "+" : "−"}${pesos(Math.abs(difference))} (${difference > 0 ? "+" : "−"}${Math.round((Math.abs(difference) / estimated!) * 100)} %)`}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Subir precio"
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/25 text-xl font-bold disabled:opacity-30"
                    disabled={counterAmount >= maxCounter}
                    onClick={() => setCounterAmount(Math.min(maxCounter, counterAmount + 1))}
                  >
                    +
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="h-11 rounded-full border border-white/25 font-semibold" onClick={() => setCounterAmount(null)}>
                    Volver
                  </button>
                  <button
                    className="h-11 rounded-full bg-brand-strong font-semibold disabled:opacity-50"
                    disabled={counter.isPending || sameAsEstimate}
                    onClick={() => counter.mutate({ id: offer.id, amount: counterAmount })}
                  >
                    {counter.isPending ? "Enviando" : "Enviar"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="h-14 w-full rounded-full bg-brand-strong text-lg font-bold disabled:opacity-60"
                  disabled={accept.isPending || reject.isPending}
                  onClick={() => accept.mutate(offer.id)}
                >
                  {accept.isPending ? "Aceptando" : "Aceptar"}
                </button>
                {canCounter && (
                  <button
                    type="button"
                    className="h-12 w-full rounded-full border border-white/25 font-semibold disabled:opacity-60"
                    disabled={accept.isPending || reject.isPending}
                    onClick={() => setCounterAmount(Math.min(maxCounter, Math.max(minCounter, Math.round(estimated))))}
                  >
                    Proponer otro precio
                  </button>
                )}
                <button
                  type="button"
                  className="h-11 w-full rounded-full font-semibold text-[#ff8b9a] disabled:opacity-60"
                  disabled={accept.isPending || reject.isPending}
                  onClick={() => reject.mutate(offer.id)}
                >
                  {reject.isPending ? "Rechazando" : "Rechazar"}
                </button>
              </>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell full>
      <div className="relative min-h-0 flex-1">
        {active.isSuccess && !active.data ? (
          <MapView center={here ?? center} driver={here} focus={focus} driverIsMe />
        ) : (
          <div className="absolute inset-0 bg-foam" aria-hidden="true" />
        )}
        <button
          type="button"
          aria-label="Centrar en mi ubicación"
          className="absolute bottom-20 right-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-surface text-ink shadow-lg"
          onClick={() => {
            // Centra de inmediato con la última posición conocida y luego con una lectura nueva.
            if (here) setFocus({ ...here });
            void locateOnce().then((pin) => pin && setFocus({ ...pin }));
          }}
        >
          <LocateFixed size={22} />
        </button>
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-surface/95 py-1.5 pl-4 pr-1.5 text-ink shadow-lg backdrop-blur">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            {online && <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60" />}
            <span className={`relative h-2.5 w-2.5 rounded-full ${online ? "bg-ok" : "bg-night/30"}`} />
          </span>
          <span className="text-sm font-bold">{online ? "En línea" : "Desconectado"}</span>
          <button
            role="switch"
            aria-checked={online}
            aria-label={online ? "Desconectarme" : "Conectarme"}
            disabled={toggle.isPending}
            className={`relative h-7 w-12 rounded-full transition disabled:opacity-60 ${online ? "bg-ok" : "bg-ink/15"}`}
            onClick={() => {
              if (!online) prepareAlerts();
              toggle.mutate();
            }}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-all ${online ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="absolute left-3 right-3 top-16 z-30 space-y-2 md:left-1/2 md:right-auto md:w-[400px] md:-translate-x-1/2">
          {toggle.error && <p className="rounded-2xl bg-surface px-3 py-2 text-sm text-danger shadow">{(toggle.error as Error).message}</p>}
          {membership.data && membership.data.status !== "active" && (
            <Link to="/conductor/membresia" className="block rounded-2xl bg-surface px-4 py-3 text-sm font-semibold shadow-lg">
              La membresía no está vigente. Renueva $200 para recibir viajes.
            </Link>
          )}
          <LocationNotice />
          {online && <AlertsNotice />}
        </div>
        <Link
          to="/conductor/demanda"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-surface px-4 py-3 text-sm font-bold shadow-lg"
        >
          <Flame size={17} className="text-[#ea580c]" aria-hidden="true" /> Ver zonas con demanda
        </Link>
      </div>
    </Shell>
  );
}

function CounterWaiting({ offer }: { offer: Offer }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = offer.counter_expires_at ? Math.max(0, Math.ceil((Date.parse(offer.counter_expires_at) - now) / 1000)) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface-dark px-6 text-center text-white">
      <p className="text-sm text-white/60">Propusiste</p>
      <p className="mt-1 text-5xl font-extrabold">{pesos(offer.proposed_fare)}</p>
      <p className="mt-1 text-sm text-white/50">Tarifa estimada {pesos(offer.estimated_fare)}</p>
      <p className="mt-6 font-semibold">Esperando respuesta del pasajero</p>
      <p className="mt-1 text-sm text-white/60" aria-live="polite">{left} s</p>
      <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
        <span className="ruta-bar block h-full w-1/3 rounded-full bg-surface" />
      </div>
      <p className="mt-6 max-w-[30ch] text-xs text-white/50">{offer.destination_label?.split(" · ")[0] ?? "Destino"}</p>
    </div>
  );
}

/** Distancia y tiempo del conductor a la recogida; "≈" cuando no hubo cálculo por calles. */
function pickupDetail(offer: Offer) {
  if (offer.pickup_distance_m == null) return "Cerca de ti";
  const approx = offer.pickup_by_road ? "" : "≈ ";
  const distance = offer.pickup_distance_m < 100 ? "menos de 100 m" : km(offer.pickup_distance_m);
  const minutes = offer.pickup_eta_s != null ? `${approx}${Math.max(1, Math.round(offer.pickup_eta_s / 60))} min · ` : "";
  if (offer.after_current_ride) return `Al terminar tu viaje · ${minutes}${approx}${distance} de tu destino actual`;
  return `${minutes}${approx}${distance} de ti${offer.pickup_by_road ? " por calle" : ""}`;
}

function RouteStop({ color, title, place, detail, line = false, square = false }: { color: string; title: string; place?: string; detail?: string; line?: boolean; square?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {line && <span className="absolute left-[5px] top-4 h-full w-0.5 bg-white/15" aria-hidden="true" />}
      <span className={`relative mt-1.5 h-3 w-3 shrink-0 ${square ? "rounded-sm" : "rounded-full"} ${color}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs text-white/60">{title}</span>
        {place && <span className="block truncate font-semibold">{place}</span>}
        {detail && <span className="block text-sm text-white/70">{detail}</span>}
      </span>
    </li>
  );
}

/** Anillo con los segundos que quedan para aceptar; se vuelve ámbar en los últimos 5. */
function Countdown({ seconds, total }: { seconds: number; total: number }) {
  const radius = 26;
  const length = 2 * Math.PI * radius;
  const urgent = seconds <= 5;
  return (
    <span className="relative grid h-16 w-16 shrink-0 place-items-center" role="timer" aria-label={`Quedan ${seconds} segundos para aceptar`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={urgent ? "#F2C14E" : "#5ed3e0"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - seconds / total)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className={`text-xl font-extrabold tabular-nums ${urgent ? "text-[#F2C14E]" : ""}`}>{seconds}</span>
    </span>
  );
}
