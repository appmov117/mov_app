import { useSyncExternalStore } from "react";
import type { Pin } from "../components/MapView.tsx";

/**
 * Última posición conocida del dispositivo, compartida entre pantallas para no abrir
 * otro seguimiento de GPS: la alimenta el seguimiento que ya esté activo.
 */
let current: Pin | null = null;
/** Por qué no hay ubicación: sin permiso, sin señal o navegador sin GPS. */
export type LocationProblem = "denied" | "unavailable" | "unsupported" | null;
let problem: LocationProblem = null;
const watchers = new Set<() => void>();
const notifyAll = () => watchers.forEach((notify) => notify());

export function setPosition(position: GeolocationPosition | Pin) {
  current = "coords" in position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : position;
  problem = null;
  notifyAll();
}

/** Registra un fallo del GPS para que la pantalla lo explique en lugar de quedarse en silencio. */
export function setLocationError(error: GeolocationPositionError) {
  problem = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
  notifyAll();
}

/** Pide una lectura al GPS (p. ej., al tocar "centrar") y la comparte. */
export function locateOnce(): Promise<Pin | null> {
  if (!navigator.geolocation) {
    problem = "unsupported";
    notifyAll();
    return Promise.resolve(current);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPosition(position);
        resolve(current);
      },
      (error) => {
        setLocationError(error);
        resolve(current);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8000 },
    );
  });
}

export function usePosition() {
  return useSyncExternalStore(
    (notify) => {
      watchers.add(notify);
      return () => watchers.delete(notify);
    },
    () => current,
  );
}

export function useLocationProblem() {
  return useSyncExternalStore(
    (notify) => {
      watchers.add(notify);
      return () => watchers.delete(notify);
    },
    () => problem,
  );
}
