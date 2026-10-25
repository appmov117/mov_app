import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ChevronDown, ChevronUp, CornerUpLeft, CornerUpRight, LocateFixed, MapPin, MapPinned, MessageCircle, Navigation, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeliveryProof } from "../../components/DeliveryProof.tsx";
import { MapView, type Pin } from "../../components/MapView.tsx";
import { LocationNotice } from "../../components/DriverNotices.tsx";
import { ChatButton } from "../../components/RideChat.tsx";
import { TripProgress } from "../../components/TripProgress.tsx";
import { Shell } from "../../components/Shell.tsx";
import { Loading } from "../../components/ui/loading.tsx";
import { TripInvoice } from "../../components/TripInvoice.tsx";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { km, minutes, pesos } from "../../lib/format.ts";
import { metersLabel, nextGuidance, turnLabel, type NavStep } from "../../lib/guidance.ts";
import { createLocationReporter, useLiveInterval } from "../../lib/live.ts";
import { setLocationError, setPosition } from "../../lib/position.ts";
import { googleMapsUrl, wazeUrl } from "../../lib/maps.ts";
import { keepSameLeg, remainingRoute, routeLeg, routeLength, useAnchoredPin } from "../../lib/routeLeg.ts";
import { PANEL_OFFSET, useWide } from "../../lib/useWide.ts";

type Ride = {
  id: string;
  status: string;
  service?: string;
  package?: { description: string; recipient_name: string; recipient_phone: string } | null;
  /** El conductor activó el código: hay que pedírselo al pasajero para iniciar. */
  pin_required?: boolean;
  has_delivery_photo?: boolean;
  origin: Pin;
  destination: Pin;
  origin_label: string | null;
  destination_label: string | null;
  route: { coordinates: number[][] } | null;
  passenger: { name: string } | null;
  estimated_fare: number | null;
  estimated_distance_m: number | null;
  estimated_duration_s: number | null;
  fare_amount: number | null;
  payment_method: string | null;
  distance_m: number | null;
  duration_s: number | null;
  stops: Pin[];
  current_stop_index: number;
  stop_arrived: boolean;
  next_stop: Pin | null;
  passenger_rating?: { rating: number; comment: string | null } | null;
  driver_rating?: { rating: number; comment: string | null } | null;
  /** Última ubicación del conductor guardada en el servidor. */
  driver?: { name: string; location: Pin | null } | null;
};

type LegRoute = {
  distance_m: number;
  duration_s: number;
  route: { coordinates: number[][] };
  steps: NavStep[];
};

export function DriverRide() {
  const navigate = useNavigate();
  const wide = useWide();
  const queryClient = useQueryClient();
  const interval = useLiveInterval(3000);
  const ride = useQuery({
    queryKey: ["driver-active"],
    queryFn: () => api<Ride | null>("/api/v1/drivers/me/active"),
    refetchInterval: interval,
  });
  const [invoice, setInvoice] = useState<Ride | null>(null);
  const [gps, setMe] = useState<Pin | null>(null);
  // Sin lectura del GPS (permiso negado o sin señal), la última ubicación que guardó el servidor:
  // así el auto no desaparece del mapa ni la ruta se dibuja lejos de él.
  const me = gps ?? ride.data?.driver?.location ?? null;
  const [heading, setHeading] = useState<number | null>(null);
  const [fare, setFare] = useState("");
  const [method, setMethod] = useState("cash");
  const [asking, setAsking] = useState(false);
  const [follow, setFollow] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const startedNav = useRef<string | null>(null);
  const [pin, setPin] = useState("");
  // El panel se puede ocultar para ver más mapa; vuelve a abrirse al tocar su encabezado.
  const [collapsed, setCollapsed] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState("");
  const action = useMutation({
    mutationFn: async (path: string) => {
      if (path === "complete") {
        return api<Ride>(`/api/v1/rides/${ride.data?.id}/complete`, {
          method: "POST",
          body: JSON.stringify({
            fare_amount: Number(fare || ride.data?.estimated_fare || 0),
            payment_method: method,
            delivery_code: deliveryCode || undefined,
          }),
        });
      }
      if (path === "start" && ride.data?.pin_required) {
        return api(`/api/v1/rides/${ride.data.id}/start`, { method: "POST", body: JSON.stringify({ pin }) });
      }
      return api(`/api/v1/rides/${ride.data?.id}/${path}`, { method: "POST" });
    },
    onSuccess: (data, path) => {
      setAsking(false);
      if (path === "complete" && data) setInvoice(data as Ride);
      // El servidor devuelve el viaje ya actualizado: se muestra sin esperar la siguiente consulta.
      else if (data) queryClient.setQueryData(["driver-active"], data);
      queryClient.invalidateQueries({ queryKey: ["driver-active"] });
    },
  });

  useEffect(() => {
    if (ride.data?.status === "completed") setInvoice(ride.data);
  }, [ride.data]);

  useEffect(() => {
    if (!ride.data || ride.data.status !== "accepted") return;
    if (startedNav.current === ride.data.id) return;
    startedNav.current = ride.data.id;
    action.mutate("arriving");
  }, [ride.data?.id, ride.data?.status]);

  useEffect(() => {
    const current = invoice ?? ride.data;
    if (!current || current.status === "completed" || current.status === "cancelled") return;
    const report = createLocationReporter();
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMe(point);
        setPosition(point);
        if (position.coords.heading != null && !Number.isNaN(position.coords.heading)) {
          setHeading(position.coords.heading);
        }
        report(position);
      },
      setLocationError,
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [ride.data?.id, ride.data?.status, invoice?.id]);

  const current = invoice?.status === "completed" ? invoice : ride.data;
  const pickingUp = Boolean(current && ["accepted", "driver_arriving", "driver_arrived"].includes(current.status));
  const going = current?.status === "in_progress";
  const navigating = Boolean(current && current.status !== "completed" && current.status !== "cancelled");
  const navTarget =
    going && current
      ? current.next_stop ?? current.destination
      : pickingUp && current
        ? current.origin
        : null;

  // La línea y la guía usan la posición en vivo; la ruta se vuelve a pedir cada 100 m.
  const legOrigin = useAnchoredPin(me, 100);
  const legKey = ["driver-leg", legOrigin?.latitude, legOrigin?.longitude, navTarget?.latitude, navTarget?.longitude, current?.status];
  const leg = useQuery({
    queryKey: legKey,
    enabled: Boolean(legOrigin && navTarget && current && current.status !== "completed"),
    queryFn: () =>
      api<LegRoute>("/api/v1/geo/route", {
        method: "POST",
        body: JSON.stringify({ origin: legOrigin, destination: navTarget }),
      }),
    placeholderData: (previous, query) => keepSameLeg(previous, query, legKey),
    refetchInterval: 15_000,
  });
  const guidance = useMemo(
    () => nextGuidance(leg.data?.steps ?? [], me, leg.data?.route.coordinates),
    [leg.data?.steps, leg.data?.route, me?.latitude, me?.longitude],
  );
  const nextStep = guidance.step;

  if (ride.isLoading) return <Shell nav={false}><Loading label="Cargando viaje" /></Shell>;

  if (current?.status === "completed") {
    return (
      <Shell nav={false}>
        <TripInvoice
          ride={current}
          role="driver"
          submit={({ rating, comment }) =>
            api(`/api/v1/rides/${current.id}/rating`, {
              method: "POST",
              body: JSON.stringify({ rating, comment }),
            })
          }
          onRated={() => queryClient.invalidateQueries({ queryKey: ["driver-active"] })}
          onDone={() => {
            setInvoice(null);
            navigate("/conductor");
          }}
        />
      </Shell>
    );
  }

  if (!current) {
    return (
      <Shell nav={false}>
        <div className="flex flex-1 flex-col justify-end p-5">
          <p>No hay un viaje asignado.</p>
          <Button className="mt-4" onClick={() => navigate("/conductor")}>Volver al inicio</Button>
        </div>
      </Shell>
    );
  }

  const nextStop = current.next_stop;
  const stopNumber = current.current_stop_index + 1;
  const liveRoute = leg.data?.route.coordinates ?? null;
  const tripRoute =
    going
      ? routeLeg(
          current.route?.coordinates ?? [],
          current.current_stop_index > 0 ? current.stops[current.current_stop_index - 1] : current.origin,
          nextStop ?? current.destination,
        )
      : null;
  const activeRoute = remainingRoute(liveRoute ?? tripRoute ?? [], me);
  const step =
    current.status === "accepted" || current.status === "driver_arriving"
      ? "arrived"
      : current.status === "driver_arrived"
        ? "start"
        : "";
  const stepLabel = current.status === "driver_arrived" ? "Iniciar viaje" : "Ya llegué";
  const phaseTitle =
    going && nextStop
      ? current.stop_arrived
        ? `Llegaste al punto ${stopNumber}`
        : `Hacia el punto ${stopNumber}`
      : going
        ? current.destination_label
        : current.origin_label;
  const phaseHint =
    going && nextStop
      ? `Parada ${stopNumber} de ${current.stops.length}`
      : going
        ? "Navegación al destino"
        : current.status === "driver_arrived"
          ? "Esperando al pasajero"
          : "Navegación · punto de encuentro";

  return (
    <Shell nav={false} full>
      <div className="relative min-h-0 flex-1">
        <MapView
          center={me ?? navTarget ?? current.origin}
          origin={pickingUp ? current.origin : going ? undefined : current.origin}
          destination={navTarget}
          driver={me}
          driverIsMe
          heading={heading}
          stops={going ? current.stops : []}
          route={activeRoute}
          navigate={navigating}
          follow={follow}
          recenterToken={recenterToken}
          onUserPan={() => setFollow(false)}
          fit={false}
          fitPadding={wide ? { top: 160, bottom: 48, left: PANEL_OFFSET, right: 48 } : { top: 160, bottom: 300, left: 48, right: 48 }}
        />
        {current.status !== "driver_arrived" && (
          <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl bg-surface/95 py-2 pl-2 pr-4 text-ink shadow-lg backdrop-blur lg:left-4 lg:top-4 landscape:left-[356px]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-strong text-white">
              <TurnIcon step={nextStep} />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-extrabold leading-none">
                {metersLabel(guidance.distance_m || nextStep?.distance_m || 0)}
              </span>
              {nextStep?.name && <span className="mt-1 block truncate text-sm text-muted">{nextStep.name}</span>}
            </span>
          </div>
        )}
        <LocationNotice compact className="absolute bottom-4 left-3 right-[84px] z-30 landscape:left-[356px] lg:bottom-auto lg:left-4 lg:right-auto lg:top-[150px] lg:w-[400px]" />
        {navTarget && activeRoute.length > 1 && (
          <TripProgress
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2"
            remaining={routeLength(activeRoute)}
            leg={`${current.id}-${current.status}-${current.current_stop_index}`}
            eta={leg.data?.duration_s}
            target={going ? (nextStop ? `Parada ${stopNumber}` : "Destino") : "Punto de encuentro"}
          />
        )}
        <button
          type="button"
          aria-label="Centrar en mi ubicación"
          className={`absolute bottom-4 right-4 z-20 grid h-12 w-12 place-items-center rounded-full shadow-lg ${follow ? "bg-ink text-surface" : "bg-surface text-ink"}`}
          onClick={() => {
            setFollow(true);
            setRecenterToken((value) => value + 1);
          }}
        >
          <LocateFixed size={22} />
        </button>
      </div>
      <section className="relative z-20 -mt-4 rounded-t-[28px] bg-surface px-5 pb-4 text-ink shadow-[0_-8px_30px_rgba(16,24,32,0.12)] lg:absolute lg:bottom-4 lg:left-4 lg:mt-0 lg:max-h-[calc(100%-11rem)] lg:w-[400px] lg:overflow-y-auto lg:rounded-[28px] lg:pt-1 lg:shadow-[0_18px_50px_rgba(16,24,32,0.18)] landscape:absolute landscape:bottom-3 landscape:left-3 landscape:top-3 landscape:mt-0 landscape:max-h-none landscape:w-[340px] landscape:overflow-y-auto landscape:rounded-3xl">
        <button
          type="button"
          className="flex w-full flex-col items-center pb-1 pt-2"
          aria-expanded={!collapsed}
          aria-controls="driver-sheet"
          aria-label={collapsed ? "Mostrar detalles del viaje" : "Ocultar detalles del viaje"}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        </button>
        <button type="button" className="block w-full text-left" onClick={() => setCollapsed((value) => !value)}>
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm text-muted">{phaseHint}</span>
              <span className="block truncate text-2xl font-extrabold">{phaseTitle}</span>
            </span>
            {collapsed ? <ChevronUp size={22} className="shrink-0 text-muted" aria-hidden="true" /> : <ChevronDown size={22} className="shrink-0 text-muted" aria-hidden="true" />}
          </span>
        </button>
        <div
          id="driver-sheet"
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
        >
        <div className="min-h-0 overflow-hidden" inert={collapsed}>
        <p className="mt-1 text-sm text-muted">
          {current.passenger?.name ?? "Pasajero"}
          {leg.data ? ` · ${km(leg.data.distance_m)} · ${minutes(leg.data.duration_s)}` : ` · ${km(current.estimated_distance_m)}`}
          {` · ${pesos(current.estimated_fare)}`}
        </p>
        <ChatButton
          rideId={current.id}
          role="driver"
          counterpart={current.passenger?.name ?? "Pasajero"}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foam text-sm font-semibold"
        >
          <MessageCircle size={16} /> Mensaje a {current.passenger?.name.split(" ")[0] ?? "pasajero"}
        </ChatButton>
        {navTarget && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-foam text-sm font-semibold"
              href={googleMapsUrl(navTarget, me)}
              target="_blank"
              rel="noreferrer"
            >
              <MapPinned size={16} /> Google Maps
            </a>
            <a
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-foam text-sm font-semibold"
              href={wazeUrl(navTarget)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={16} /> Waze
            </a>
          </div>
        )}
        {current.package && (
          <div className="mt-3 rounded-2xl bg-foam px-4 py-3 text-sm">
            <p className="font-semibold">Envío: {current.package.description}</p>
            <p className="text-muted">
              Recibe {current.package.recipient_name} ·{" "}
              <a className="underline" href={`tel:${current.package.recipient_phone}`}>
                {current.package.recipient_phone}
              </a>
            </p>
          </div>
        )}
        {going && !nextStop && asking && (
          <div className="mt-4 space-y-3">
            <p className="font-semibold">¿Cuánto cobraste?</p>
            <input
              inputMode="decimal"
              value={fare}
              placeholder={String(current.estimated_fare ?? "")}
              className="h-12 w-full rounded-2xl border border-line bg-surface px-3 text-ink"
              onChange={(event) => setFare(event.target.value)}
            />
            <div className="flex gap-2 text-sm">
              {[
                ["cash", "Efectivo"],
                ["driver_terminal", "Terminal"],
                ["transfer", "Transferencia"],
                ["other", "Otro"],
              ].map(([id, label]) => (
                <button key={id} className={`rounded-full px-3 py-2 ${method === id ? "bg-ink text-surface" : "bg-foam"}`} onClick={() => setMethod(id)}>
                  {label}
                </button>
              ))}
            </div>
            {current.package && (
              <DeliveryProof
                rideId={current.id}
                hasPhoto={Boolean(current.has_delivery_photo)}
                code={deliveryCode}
                onCode={setDeliveryCode}
                onUploaded={() => queryClient.invalidateQueries({ queryKey: ["driver-active"] })}
              />
            )}
            <button
              className="h-12 w-full rounded-full bg-brand-strong font-semibold text-white disabled:opacity-60"
              disabled={action.isPending || (Boolean(current.package) && (!current.has_delivery_photo || deliveryCode.length !== 4))}
              onClick={() => action.mutate("complete")}
            >
              {action.isPending ? "Finalizando" : "Registrar cobro y finalizar"}
            </button>
          </div>
        )}
        {going && nextStop && (
          <button
            className="mt-4 h-12 w-full rounded-full bg-brand-strong font-semibold text-white disabled:opacity-60"
            disabled={action.isPending}
            onClick={() => action.mutate(current.stop_arrived ? "stops/continue" : "stops/arrived")}
          >
            {current.stop_arrived ? "Continuar al siguiente" : `Llegué al punto ${stopNumber}`}
          </button>
        )}
        {going && !nextStop && !asking && (
          <button className="mt-4 h-12 w-full rounded-full bg-brand-strong font-semibold text-white" onClick={() => setAsking(true)}>
            Finalizar viaje
          </button>
        )}
        {!going && step === "start" && current.pin_required && (
          <input
            inputMode="numeric"
            value={pin}
            placeholder="Código de seguridad del pasajero"
            aria-label="Código de seguridad del pasajero"
            className="mt-4 h-12 w-full rounded-2xl border border-line bg-surface px-3 text-center text-lg font-bold tracking-[0.3em] text-ink placeholder:text-sm placeholder:font-normal placeholder:tracking-normal"
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        )}
        {!going && step && (
          <button
            className="mt-4 h-12 w-full rounded-full bg-brand-strong font-semibold text-white disabled:opacity-60"
            disabled={action.isPending || (step === "start" && Boolean(current.pin_required) && pin.length !== 4)}
            onClick={() => action.mutate(step)}
          >
            {action.isPending ? "Un momento" : stepLabel}
          </button>
        )}
        {action.error && !action.isPending && <p className="mt-2 text-sm text-warn">{(action.error as Error).message}</p>}
        </div>
        </div>
      </section>
    </Shell>
  );
}

/** Flecha de la próxima maniobra; la calle y la distancia van junto a ella. */
function TurnIcon({ step }: { step: NavStep | null }) {
  const label = turnLabel(step);
  const Icon =
    label === "Izquierda" ? CornerUpLeft : label === "Derecha" ? CornerUpRight : label === "Retorno" ? Undo2 : label === "Llegada" ? MapPin : ArrowUp;
  return <Icon size={26} strokeWidth={2.6} aria-label={label} />;
}
