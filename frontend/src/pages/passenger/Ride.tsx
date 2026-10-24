import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Phone, Share2, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapView, type Pin } from "../../components/MapView.tsx";
import { ChatButton } from "../../components/RideChat.tsx";
import { TripProgress } from "../../components/TripProgress.tsx";
import { SafetySheet, elapsed, shareTrip } from "../../components/SafetySheet.tsx";
import { Shell } from "../../components/Shell.tsx";
import { Loading } from "../../components/ui/loading.tsx";
import { TripInvoice } from "../../components/TripInvoice.tsx";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { km, pesos } from "../../lib/format.ts";
import { onLive, useLiveInterval } from "../../lib/live.ts";
import { keepSameLeg, remainingRoute, routeLeg, routeLength, useAnchoredPin } from "../../lib/routeLeg.ts";
import { PANEL_OFFSET, useWide } from "../../lib/useWide.ts";
import { RecentTrip } from "./RecentTrip.tsx";
import { useSafetyRecorder } from "../../lib/useSafetyRecorder.ts";

type Vehicle = { brand: string; model: string; color: string | null; plate: string };
type Driver = { id: string; name: string; phone: string | null; rating: number; vehicle: Vehicle | null; location: Pin | null };
type Ride = {
  id: string;
  status: string;
  origin: Pin;
  destination: Pin;
  origin_label: string | null;
  destination_label: string | null;
  route: { coordinates: number[][] } | null;
  estimated_fare: number | null;
  estimated_distance_m: number | null;
  estimated_duration_s: number | null;
  fare_amount: number | null;
  payment_method: string | null;
  distance_m: number | null;
  duration_s: number | null;
  driver: Driver | null;
  rating: { rating: number; comment: string | null } | null;
  passenger_rating?: { rating: number; comment: string | null } | null;
  driver_rating?: { rating: number; comment: string | null } | null;
  stops: Pin[];
  current_stop_index: number;
  stop_arrived: boolean;
  next_stop: Pin | null;
};
type RequestView = {
  id: string;
  status: string;
  origin: Pin;
  destination: Pin;
  destination_label: string | null;
  route: { coordinates: number[][] } | null;
  estimated_fare: number | null;
  estimated_duration_s: number | null;
  estimated_distance_m?: number | null;
  stops: Pin[];
  counter_offers: CounterOffer[];
};
type CounterOffer = {
  id: string;
  proposed_fare: number;
  expires_at: string;
  seconds_left: number;
  pickup_eta_s: number | null;
  pickup_by_road: boolean;
  driver: { name: string; rating: number; vehicle: { brand: string; model: string; color: string; plate: string } | null };
};
type Active = { request: RequestView | null; ride: Ride | null };
type LegRoute = {
  distance_m: number;
  duration_s: number;
  route: { coordinates: number[][] };
};

export function PassengerRide() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const wide = useWide();
  const [live, setLive] = useState<Pin | null>(null);
  const [notice, setNotice] = useState("");
  const interval = useLiveInterval(3000);
  const active = useQuery({
    queryKey: ["passenger-active"],
    queryFn: () => api<Active | null>("/api/v1/passengers/me/active"),
    refetchInterval: interval,
  });
  const ride = active.data?.ride ?? null;
  const request = active.data?.request ?? null;
  const origin = ride?.origin ?? request?.origin;
  const destination = ride?.destination ?? request?.destination;
  const driverLocation = live ?? ride?.driver?.location ?? null;
  const status = ride?.status ?? request?.status ?? "searching";
  const searching = status === "searching" || status === "offered";
  const withDriver = status === "accepted" || status === "driver_arriving" || status === "driver_arrived";
  const moving = status === "in_progress";
  const done = status === "completed";
  const pickupTarget = withDriver ? origin : moving ? ride?.next_stop ?? destination : null;
  const recorder = useSafetyRecorder(ride?.id);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const counterCount = request?.counter_offers.length ?? 0;
  const seenCounters = useRef(0);

  // Una contraoferta nueva no puede quedar escondida: abre el panel y avisa con vibración.
  useEffect(() => {
    if (counterCount > seenCounters.current) {
      setCollapsed(false);
      navigator.vibrate?.([200, 100, 200]);
    }
    seenCounters.current = counterCount;
  }, [counterCount]);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  const approachFrom = useAnchoredPin(driverLocation, 100);
  const approachKey = ["passenger-approach", approachFrom?.latitude, approachFrom?.longitude, pickupTarget?.latitude, pickupTarget?.longitude, status];
  const approach = useQuery({
    queryKey: approachKey,
    enabled: Boolean(approachFrom && pickupTarget && (withDriver || moving)),
    queryFn: () =>
      api<LegRoute>("/api/v1/geo/route", {
        method: "POST",
        body: JSON.stringify({ origin: approachFrom, destination: pickupTarget }),
      }),
    placeholderData: (previous, query) => keepSameLeg(previous, query, approachKey),
    refetchInterval: 20_000,
  });

  // Estado del viaje y chat llegan por el canal del usuario (LiveSync); aquí solo la posición del carro.
  useEffect(() => {
    if (!ride) return;
    return onLive((message) => {
      if (message.type === "driver_location" && message.ride_id === ride.id) setLive(message.data);
    });
  }, [ride?.id]);

  useEffect(() => {
    if (!withDriver && !moving) recorder.stop();
  }, [withDriver, moving]);

  const cancel = useMutation({
    mutationFn: async () => {
      if (ride) return api(`/api/v1/rides/${ride.id}/cancel`, { method: "POST" });
      if (request) return api(`/api/v1/ride-requests/${request.id}/cancel`, { method: "POST" });
    },
    onSuccess: () => navigate("/pasajero"),
  });

  if (active.isLoading) return <Shell nav={false}><Loading label="Cargando viaje" /></Shell>;
  if (!ride && !request) {
    return (
      <Shell>
        <RecentTrip />
      </Shell>
    );
  }

  if (done && ride) {
    return (
      <Shell nav={false}>
        <TripInvoice
          ride={ride}
          role="passenger"
          submit={({ rating, comment }) =>
            api(`/api/v1/rides/${ride.id}/rating`, {
              method: "POST",
              body: JSON.stringify({ rating, comment }),
            })
          }
          onRated={() => queryClient.invalidateQueries({ queryKey: ["passenger-active"] })}
          onDone={() => navigate("/pasajero")}
        />
      </Shell>
    );
  }

  const fullRoute = ride?.route?.coordinates ?? request?.route?.coordinates;
  const tripRoute =
    moving && ride
      ? routeLeg(
          fullRoute ?? [],
          ride.current_stop_index > 0 ? ride.stops[ride.current_stop_index - 1] : ride.origin,
          ride.next_stop ?? ride.destination,
        )
      : fullRoute;
  const route =
    withDriver || moving
      ? (approach.data ? remainingRoute(approach.data.route.coordinates, driverLocation) : moving ? tripRoute : null)
      : tripRoute;
  const eta = approach.data
    ? Math.max(1, Math.round(approach.data.duration_s / 60))
    : driverLocation && origin
      ? etaMinutes(driverLocation, origin)
      : null;
  const arrival = approach.data && moving
    ? Math.max(1, Math.round(approach.data.duration_s / 60))
    : ride?.estimated_duration_s
      ? Math.max(1, Math.round(ride.estimated_duration_s / 60))
      : null;
  const distanceLabel = km(approach.data?.distance_m ?? ride?.distance_m ?? ride?.estimated_distance_m ?? request?.estimated_distance_m);
  const fare = ride?.fare_amount ?? ride?.estimated_fare ?? request?.estimated_fare;
  const driverStatus =
    status === "driver_arrived"
      ? "ya llegó"
      : status === "driver_arriving"
        ? `va en camino · ${eta ?? "—"} min`
        : `llega en ${eta ?? "—"} min`;

  function share() {
    void shareTrip(ride, driverLocation, request?.destination_label);
  }

  const place = shortLabel(ride?.destination_label ?? request?.destination_label);

  return (
    <Shell nav={false} scroll={false} full>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {moving && (
          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-surface/95 px-4 py-3 backdrop-blur">
            <p className="font-extrabold">En viaje</p>
            <button className="flex items-center gap-1 text-sm font-semibold text-ink" onClick={share}>
              <Share2 size={16} /> Compartir
            </button>
          </header>
        )}
        <div className="absolute inset-0">
          {origin && (
            <MapView
              center={driverLocation ?? origin}
              origin={origin}
              destination={withDriver ? origin : moving ? ride?.next_stop ?? destination : destination}
              driver={driverLocation}
              route={route}
              stops={moving ? ride?.stops ?? [] : []}
              fit={Boolean(route && route.length > 1) || Boolean(driverLocation && origin)}
              fitPadding={wide ? { top: 72, bottom: 56, left: PANEL_OFFSET, right: 56 } : { top: 72, bottom: 220, left: 56, right: 56 }}
              pulse={searching}
            />
          )}
        </div>
        {withDriver && eta != null && status !== "driver_arrived" && (
          <p className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-surface shadow">
            {status === "driver_arriving" ? `Conductor en camino · ${eta} min` : `Tu conductor llega en ${eta} min`}
          </p>
        )}
        {moving && arrival != null && (
          <p className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-2 text-sm font-bold text-white shadow">
            Llegada en {arrival} min · {distanceLabel}
          </p>
        )}
        {ride && (withDriver || moving) && (
          <div className={`absolute right-3 z-20 flex flex-col items-end gap-2 ${moving ? "top-16" : "top-4"}`}>
            <button
              type="button"
              aria-label="Seguridad y emergencias"
              className={`grid h-11 w-11 place-items-center rounded-full shadow-lg ${recorder.kind ? "bg-danger text-white" : "bg-surface text-danger"}`}
              onClick={() => setSafetyOpen(true)}
            >
              <ShieldAlert size={20} />
            </button>
            {recorder.kind && (
              <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-danger shadow" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                {elapsed(recorder.seconds)}
              </span>
            )}
          </div>
        )}
        {ride && (withDriver || moving) && route && route.length > 1 && (
          <TripProgress
            compact
            className={`absolute left-3 z-20 ${moving ? "top-16" : "top-4"}`}
            remaining={routeLength(route)}
            leg={`${ride.id}-${status}-${ride.current_stop_index}`}
            eta={approach.data?.duration_s}
            target={withDriver ? "Recogida" : ride.next_stop ? "Parada" : "Destino"}
          />
        )}
        {safetyOpen && ride && (
          <SafetySheet ride={ride} position={driverLocation} recorder={recorder} onClose={() => setSafetyOpen(false)} />
        )}
        <section className="ruta-sheet absolute inset-x-0 bottom-0 z-20 rounded-t-[28px] bg-surface px-5 pb-5 shadow-[0_-12px_40px_rgba(16,24,32,0.12)] lg:inset-x-auto lg:bottom-4 lg:left-4 lg:max-h-[calc(100%-2rem)] lg:w-[400px] lg:overflow-y-auto lg:rounded-[28px] lg:shadow-[0_18px_50px_rgba(16,24,32,0.18)]">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="ride-sheet"
            aria-label={collapsed ? "Mostrar detalles del viaje" : "Ocultar detalles del viaje"}
            className="block w-full touch-none pb-3 pt-3"
            onClick={() => {
              if (dragged.current) dragged.current = false;
              else setCollapsed((value) => !value);
            }}
            onPointerDown={(event) => {
              dragStart.current = event.clientY;
              dragged.current = false;
            }}
            onPointerUp={(event) => {
              const start = dragStart.current;
              dragStart.current = null;
              if (start == null) return;
              const delta = event.clientY - start;
              // Un arrastre claro decide; un toque corto lo resuelve onClick.
              if (Math.abs(delta) > 30) {
                dragged.current = true;
                setCollapsed(delta > 0);
              }
            }}
          >
            <span className="mx-auto block h-1.5 w-10 rounded-full bg-line" />
          </button>
          {collapsed && (
            <button type="button" className="flex w-full items-center gap-3 pb-1 text-left" onClick={() => setCollapsed(false)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">
                  {searching
                    ? "Buscando un conductor…"
                    : withDriver && ride?.driver
                      ? `${firstName(ride.driver.name)} ${driverStatus}`
                      : moving
                        ? `Llegada en ${arrival ?? "—"} min`
                        : "Detalles del viaje"}
                </span>
                <span className="block truncate text-sm text-muted">
                  {(withDriver || moving) && ride?.driver?.vehicle
                    ? `${ride.driver.vehicle.brand} ${ride.driver.vehicle.model} · ${ride.driver.vehicle.plate}`
                    : `Hacia ${place}`}
                </span>
              </span>
              <span className="shrink-0 text-lg font-extrabold">{pesos(fare)}</span>
            </button>
          )}
          <div
            id="ride-sheet"
            className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
          >
          <div className="min-h-0 overflow-hidden" inert={collapsed}>
          <div className="max-h-[62dvh] overflow-y-auto overscroll-contain">
        {searching && (
          <>
            <h1 className="text-center text-xl font-extrabold">
              Buscando un conductor
              <span className="ruta-dot" style={{ animationDelay: "0s" }}>.</span>
              <span className="ruta-dot" style={{ animationDelay: "0.2s" }}>.</span>
              <span className="ruta-dot" style={{ animationDelay: "0.4s" }}>.</span>
            </h1>
            <div className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-foam">
              <span className="ruta-bar block h-full w-1/3 rounded-full bg-ink" />
            </div>
            <p className="mt-3 text-center text-sm text-muted">Hacia {place}</p>
            <p className="mt-1 text-center text-sm font-semibold">{fare == null ? "Calculando tarifa" : pesos(fare)}</p>
            {(request?.counter_offers.length ?? 0) > 0 && <CounterOffers offers={request!.counter_offers} fare={fare ?? null} />}
            <Button className="mt-4" variant="line" onClick={() => cancel.mutate()}>Cancelar</Button>
          </>
        )}
        {withDriver && ride?.driver && (
          <>
            <p className="text-lg font-extrabold">
              {firstName(ride.driver.name)} {driverStatus}
            </p>
            <DriverCard driver={ride.driver} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
              <a className="grid justify-items-center gap-1 rounded-2xl bg-foam py-3" href={ride.driver.phone ? `tel:${ride.driver.phone}` : undefined}>
                <Phone size={18} /> Llamar
              </a>
              <ChatButton rideId={ride.id} role="passenger" counterpart={ride.driver.name} className="grid justify-items-center gap-1 rounded-2xl bg-foam py-3">
                <MessageCircle size={18} /> Mensaje
              </ChatButton>
              <button className="grid justify-items-center gap-1 rounded-2xl bg-foam py-3 text-danger" onClick={() => cancel.mutate()}>
                <X size={18} /> Cancelar
              </button>
            </div>
          </>
        )}
        {moving && (
          <>
            {ride?.next_stop && (
              <div className="mb-4 rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
                <p className="text-sm font-semibold">
                  Parada {ride.current_stop_index + 1} de {ride.stops.length}
                </p>
                <p className="font-extrabold">
                  {ride.stop_arrived ? "El conductor llegó a esta parada" : "En camino a la siguiente parada"}
                </p>
              </div>
            )}
            <p className="text-sm text-muted">Llegada estimada</p>
            <p className="text-4xl font-extrabold">{arrival ?? "—"} min</p>
            <p className="mt-1 text-sm font-semibold text-muted">{distanceLabel}</p>
            <p className="mt-3 text-sm text-muted">Destino</p>
            <p className="text-lg font-extrabold">{shortLabel(ride?.destination_label)}</p>
            <p className="mt-3 text-sm text-muted">Tarifa aproximada</p>
            <p className="text-2xl font-extrabold">{pesos(fare)}</p>
            {ride?.driver && (
              <>
                <DriverCard driver={ride.driver} />
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs font-semibold">
                  <a className="grid justify-items-center gap-1 rounded-2xl bg-foam py-3" href={ride.driver.phone ? `tel:${ride.driver.phone}` : undefined}>
                    <Phone size={18} /> Llamar
                  </a>
                  <ChatButton rideId={ride.id} role="passenger" counterpart={ride.driver.name} className="grid justify-items-center gap-1 rounded-2xl bg-foam py-3">
                    <MessageCircle size={18} /> Mensaje
                  </ChatButton>
                </div>
              </>
            )}
            <button
              className="mt-4 h-12 w-full rounded-full border border-[#f3b4c0] font-semibold text-danger"
              onClick={() => setNotice("El conductor cierra el viaje y anota lo que cobró.")}
            >
              Finalizar viaje
            </button>
            {notice && <p className="mt-2 text-center text-sm text-muted">{notice}</p>}
          </>
        )}
        {(status === "cancelled" || status === "expired") && (
          <>
            <h1 className="text-2xl font-extrabold">{status === "expired" ? "No encontramos conductor" : "Viaje cancelado"}</h1>
            <Button className="mt-4" onClick={() => navigate("/pasajero")}>Nuevo viaje</Button>
          </>
        )}
          </div>
          </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}

function CounterOffers({ offers, fare }: { offers: CounterOffer[]; fare: number | null }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "decline" }) =>
      api(`/api/v1/ride-offers/${id}/counter/${action}`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["passenger-active"] }),
  });
  // Plazo de cada contraoferta contado desde que llegó, con los segundos del servidor:
  // un reloj del teléfono adelantado no debe ocultarlas.
  const deadlines = useMemo(() => new Map(offers.map((offer) => [offer.id, Date.now() + offer.seconds_left * 1000])), [offers]);
  const deadline = (offer: CounterOffer) => deadlines.get(offer.id) ?? 0;
  const visible = offers.filter((offer) => deadline(offer) > now);
  if (visible.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-bold text-ink">Contraofertas</p>
      {visible.map((offer) => {
        const left = Math.max(0, Math.ceil((deadline(offer) - now) / 1000));
        const vehicle = offer.driver.vehicle;
        return (
          <article key={offer.id} className="rounded-2xl border border-line p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foam text-sm font-extrabold text-ink">
                {initials(offer.driver.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {firstName(offer.driver.name)} · {offer.driver.rating.toFixed(1)} ★
                </span>
                <span className="block truncate text-xs text-muted">
                  {vehicle ? `${vehicle.brand} ${vehicle.model} · ` : ""}
                  {offer.pickup_eta_s != null ? `llega en ${offer.pickup_by_road ? "" : "≈ "}${Math.max(1, Math.round(offer.pickup_eta_s / 60))} min` : "cerca de ti"}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-extrabold">{pesos(offer.proposed_fare)}</span>
                {fare != null && offer.proposed_fare !== fare && (
                  <span className={`block text-[11px] ${offer.proposed_fare < fare ? "font-semibold text-ok-strong" : "text-muted"}`}>
                    {offer.proposed_fare < fare ? `${pesos(fare - offer.proposed_fare)} menos` : `+${pesos(offer.proposed_fare - fare)}`}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="line" size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: offer.id, action: "decline" })}>
                Rechazar
              </Button>
              <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: offer.id, action: "accept" })}>
                Aceptar · {left} s
              </Button>
            </div>
          </article>
        );
      })}
      {respond.error && <p className="text-sm text-danger">{(respond.error as Error).message}</p>}
    </div>
  );
}

const VEHICLE_COLORS: Record<string, string> = {
  blanco: "#f8fafc",
  negro: "#111827",
  gris: "#9ca3af",
  plata: "#cbd5e1",
  plateado: "#cbd5e1",
  rojo: "#dc2626",
  azul: "#2563eb",
  verde: "#16a34a",
  amarillo: "#facc15",
  naranja: "#f97316",
  cafe: "#78350f",
  café: "#78350f",
  beige: "#e7d7b9",
  vino: "#7f1d1d",
  dorado: "#ca8a04",
};

function DriverCard({ driver }: { driver: Driver }) {
  const vehicle = driver.vehicle;
  const swatch = vehicle?.color ? VEHICLE_COLORS[vehicle.color.trim().toLowerCase()] : undefined;
  return (
    <div className="mt-3 rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-foam font-extrabold text-ink">{initials(driver.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{driver.name}</span>
          <span className="block text-sm text-muted">★ {driver.rating.toFixed(1)} · Conductor verificado</span>
        </span>
      </div>
      {vehicle && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-foam px-3 py-2.5">
          <span
            className="h-7 w-7 shrink-0 rounded-full border border-ink/15 shadow-inner"
            style={{ background: swatch ?? "#e6e8ec" }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{vehicle.brand} {vehicle.model}</span>
            {vehicle.color && <span className="block text-xs capitalize text-muted">{vehicle.color}</span>}
          </span>
          <span className="rounded-md border-2 border-ink bg-surface px-2 py-0.5 font-mono text-base font-extrabold tracking-[0.15em]" aria-label={`Placa ${vehicle.plate}`}>
            {vehicle.plate}
          </span>
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
function firstName(name: string) {
  return name.split(" ")[0];
}
function shortLabel(label: string | null | undefined) {
  if (!label) return "Destino";
  return label.split(",")[0];
}
function etaMinutes(from: Pin, to: Pin) {
  const meters = haversine(from, to) * 1.3;
  return Math.max(1, Math.round(meters / (25_000 / 60)));
}
function haversine(a: Pin, b: Pin) {
  const r = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}
