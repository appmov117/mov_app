import { useSyncExternalStore } from "react";
import { accessToken, api } from "./api.ts";
import { distanceM } from "./guidance.ts";

export function messagesKey(rideId: string) {
  return ["ride-messages", rideId];
}

/** Mensajes que llegan por el canal del usuario. */
export type LiveMessage =
  | { type: "sync" }
  | { type: "pong" }
  | { type: "driver_location"; ride_id: string; data: { latitude: number; longitude: number; heading: number | null; speed: number | null } }
  | { type: "message"; ride_id: string; data: unknown };

type Listener = (message: LiveMessage) => void;

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;
const MIN_MOVE_M = 25;
const MIN_GAP_MS = 3_100;
const MAX_GAP_MS = 15_000;

let socket: WebSocket | null = null;
let connected = false;
let wanted = false;
let attempts = 0;
let retry: number | undefined;
let ping: number | undefined;
const listeners = new Set<Listener>();
const watchers = new Set<() => void>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  watchers.forEach((notify) => notify());
}

function schedule() {
  if (!wanted || retry !== undefined) return;
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
  attempts += 1;
  retry = window.setTimeout(() => {
    retry = undefined;
    open();
  }, delay);
}

function open() {
  if (!wanted || socket) return;
  const token = accessToken();
  if (!token) return;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const current = new WebSocket(`${protocol}://${location.host}/ws/me?token=${encodeURIComponent(token)}`);
  socket = current;
  current.onopen = () => {
    if (socket !== current) return;
    attempts = 0;
    setConnected(true);
    // Lo que cambió mientras no había conexión se recupera con un aviso de sincronía.
    listeners.forEach((listener) => listener({ type: "sync" }));
    ping = window.setInterval(() => current.send(JSON.stringify({ type: "ping" })), PING_MS);
  };
  current.onmessage = (event) => {
    if (socket !== current) return;
    let message: LiveMessage;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    listeners.forEach((listener) => listener(message));
  };
  current.onclose = (event) => {
    if (socket !== current) return;
    window.clearInterval(ping);
    socket = null;
    setConnected(false);
    if (!wanted) return;
    // 4401: el token venció. Una petición autenticada lo renueva antes de reconectar.
    if (event.code === 4401) {
      api("/api/v1/auth/me").then(schedule, () => {
        wanted = false;
      });
      return;
    }
    schedule();
  };
}

function onVisible() {
  if (document.visibilityState !== "visible" || socket) return;
  window.clearTimeout(retry);
  retry = undefined;
  attempts = 0;
  open();
}

/** Abre el canal del usuario y lo mantiene vivo hasta llamar a la función devuelta. */
export function startLive() {
  wanted = true;
  attempts = 0;
  open();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);
  return () => {
    wanted = false;
    window.clearTimeout(retry);
    retry = undefined;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onVisible);
    window.clearInterval(ping);
    const current = socket;
    socket = null;
    current?.close();
    setConnected(false);
  };
}

export function onLive(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Envía por el canal si está abierto; devuelve false para que el llamador use HTTP. */
export function sendLive(message: object) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function subscribe(notify: () => void) {
  watchers.add(notify);
  return () => {
    watchers.delete(notify);
  };
}

/** True mientras el canal en vivo está conectado. */
export function useLive() {
  return useSyncExternalStore(subscribe, () => connected);
}

/**
 * Intervalo de respaldo para una consulta: lento con el canal abierto (los avisos llegan
 * al instante) y el original cuando no hay conexión en vivo.
 */
export function useLiveInterval(offline: number, online = 60_000) {
  return useLive() ? online : offline;
}

/**
 * Devuelve una función que reporta la ubicación del conductor solo cuando hace falta:
 * si se movió al menos 25 m (y pasaron 3 s, el mínimo que acepta el API) o si pasaron 15 s.
 * Va por el canal en vivo y, si no está abierto, por HTTP.
 */
export function createLocationReporter() {
  let last: { latitude: number; longitude: number; at: number } | null = null;
  return (position: GeolocationPosition) => {
    const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    const now = Date.now();
    if (last) {
      const gap = now - last.at;
      if (gap < MIN_GAP_MS) return;
      if (gap < MAX_GAP_MS && distanceM(last, point) < MIN_MOVE_M) return;
    }
    last = { ...point, at: now };
    const data = { ...point, heading: position.coords.heading, speed: position.coords.speed };
    if (sendLive({ type: "location", data })) return;
    api("/api/v1/drivers/me/location", { method: "PUT", body: JSON.stringify(data) }).catch(() => undefined);
  };
}
