import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api.ts";
import { createLocationReporter, useLiveInterval } from "../lib/live.ts";
import { setLocationError, setPosition } from "../lib/position.ts";
import { enablePush } from "../lib/push.ts";

/** El servidor descarta conductores sin ubicación reciente; esto la mantiene viva aunque no se muevan. */
const HEARTBEAT_MS = 30_000;
const REPORTING = new Set(["online", "paused"]);
/** "busy" también recibe: con pasajero a bordo puede llegarle el viaje siguiente. */
const RECEIVING = new Set(["online", "busy"]);

type Offer = { id: string; request_id: string; status: string; destination_label: string | null };

/** Compartido entre pantallas: cada una monta su propio Shell y con él un beacon nuevo. */
let announced: string | null = null;

/**
 * Corre en todas las pantallas del conductor: reporta su ubicación mientras está en línea
 * y le avisa (vibración, sonido y notificación del navegador) cuando llega una solicitud.
 */
export function DriverBeacon() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const statusInterval = useLiveInterval(8000);
  const offersInterval = useLiveInterval(3000);
  const me = useQuery({
    queryKey: ["driver"],
    queryFn: () => api<{ driver_status: string }>("/api/v1/drivers/me"),
    refetchInterval: statusInterval,
  });
  const status = me.data?.driver_status ?? "offline";
  const offers = useQuery({
    queryKey: ["offers"],
    queryFn: () => api<Offer[]>("/api/v1/drivers/me/ride-offers"),
    refetchInterval: offersInterval,
    enabled: RECEIVING.has(status),
  });
  // La caché conserva la última oferta aunque la consulta se desactive (p. ej. ya aceptada).
  const offer = RECEIVING.has(status) ? offers.data?.find((item) => item.status === "pending") : undefined;

  useEffect(() => {
    // La pantalla del viaje mantiene su propio seguimiento para dibujar la ruta
    // y reportar la posición. Evita que ambos watchers provoquen respuestas 429.
    const onActiveRide = pathname === "/conductor/viaje";
    if (onActiveRide || !REPORTING.has(status) || !navigator.geolocation) return;
    let last: GeolocationPosition | null = null;
    const report = createLocationReporter();
    const send = () => {
      if (last) report(last);
    };
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        last = position;
        setPosition(position);
        send();
      },
      setLocationError,
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    const beat = window.setInterval(send, HEARTBEAT_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(beat);
    };
  }, [pathname, status]);

  useEffect(() => {
    if (!offer || announced === offer.id) return;
    announced = offer.id;
    navigator.vibrate?.([300, 150, 300]);
    chime();
    if (document.hidden) void showNotification(offer);
    if (pathname !== "/conductor") navigate("/conductor");
  }, [offer, pathname, navigate]);

  return null;
}

/** Activa push y el sonido de avisos; debe llamarse desde un toque del usuario. */
export function prepareAlerts() {
  void enablePush().catch(() => undefined);
  audio();
}

async function showNotification(offer: Offer) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title = "Nuevo viaje cerca de ti";
  // Misma etiqueta que el push del servidor, para que no aparezcan dos avisos del mismo viaje.
  const options = { body: offer.destination_label?.split(" · ")[0] ?? "Tienes una solicitud nueva", tag: `request_id:${offer.request_id}` };
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

let context: AudioContext | null = null;

function audio() {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function chime() {
  try {
    const ctx = audio();
    [0, 0.18].forEach((delay, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = index === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.35);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(ctx.currentTime + delay);
      oscillator.stop(ctx.currentTime + delay + 0.4);
    });
  } catch {
    // Sin audio disponible: quedan la vibración y la notificación.
  }
}
