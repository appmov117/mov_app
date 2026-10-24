import { useRef } from "react";
import type { Pin } from "../components/MapView.tsx";
import { distanceM } from "./guidance.ts";

/**
 * Devuelve un punto que solo cambia cuando el original se aleja al menos `meters`.
 * Sirve como clave de consultas de ruta: el GPS cambia en cada lectura, pero pedir
 * otra ruta solo vale la pena tras moverse una distancia real.
 */
export function useAnchoredPin(pin: Pin | null | undefined, meters: number) {
  const anchor = useRef<Pin | null>(null);
  if (!pin) anchor.current = null;
  else if (!anchor.current || distanceM(anchor.current, pin) >= meters) anchor.current = pin;
  return anchor.current;
}

export function routeLeg(route: number[][], start: Pin, end: Pin) {
  if (route.length < 2) return route;
  const nearest = (point: Pin) => {
    let result = 0;
    let distance = Number.POSITIVE_INFINITY;
    route.forEach(([longitude, latitude], index) => {
      const value = (latitude - point.latitude) ** 2 + (longitude - point.longitude) ** 2;
      if (value < distance) {
        distance = value;
        result = index;
      }
    });
    return result;
  };
  const from = nearest(start);
  const to = nearest(end);
  return route.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/**
 * `placeholderData` para consultas de ruta con clave [nombre, lat, lng, destinoLat, destinoLng, estado]:
 * conserva la ruta anterior mientras llega la nueva, solo si el destino y el estado no cambiaron.
 */
export function keepSameLeg<T>(previous: T | undefined, query?: { queryKey: readonly unknown[] }, key?: readonly unknown[]) {
  return query && key && query.queryKey.slice(3).join() === key.slice(3).join() ? previous : undefined;
}

/** Recorta la polyline desde el punto más cercano al conductor hasta el final (ruta restante). */
export function remainingRoute(route: number[][], from: Pin | null | undefined) {
  if (!route || route.length < 2 || !from) return route ?? [];
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  route.forEach(([longitude, latitude], index) => {
    const value = (latitude - from.latitude) ** 2 + (longitude - from.longitude) ** 2;
    if (value < best) {
      best = value;
      nearest = index;
    }
  });
  const tail = route.slice(nearest);
  return [[from.longitude, from.latitude] as number[], ...tail.slice(1)];
}

/** Largo en metros de una polilínea [lng, lat]: la ruta por calles que queda por recorrer. */
export function routeLength(route: number[][] | null | undefined) {
  if (!route || route.length < 2) return 0;
  let meters = 0;
  for (let index = 1; index < route.length; index += 1) {
    const [lngA, latA] = route[index - 1];
    const [lngB, latB] = route[index];
    meters += distanceM({ latitude: latA, longitude: lngA }, { latitude: latB, longitude: lngB });
  }
  return meters;
}

/**
 * Distancia total de un tramo (hacia la recogida o hacia el destino): la mayor que se ha
 * medido desde que empezó, así la barra de avance no retrocede si la ruta se recalcula.
 */
export function useLegTotal(key: string, remaining: number) {
  const totals = useRef<{ key: string; total: number }>({ key: "", total: 0 });
  if (totals.current.key !== key) totals.current = { key, total: remaining };
  else if (remaining > totals.current.total) totals.current.total = remaining;
  return totals.current.total;
}
