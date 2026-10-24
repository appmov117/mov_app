import { useSyncExternalStore } from "react";
import { useAuth } from "./auth.tsx";

/** Del más ligero al más pesado: menos capas e íconos se traducen en menos datos y carga más rápida. */
export const MAP_STYLES = [
  { id: "light", label: "Ligero", detail: "Carga más rápido y gasta casi la mitad de datos", url: "mapbox://styles/mapbox/light-v11" },
  { id: "streets", label: "Calles", detail: "Más colores; gasta casi como Detallado", url: "mapbox://styles/mapbox/streets-v12" },
  { id: "standard", label: "Detallado", detail: "Lugares e íconos; el que más datos usa", url: "mapbox://styles/mapbox/standard" },
] as const;

export type MapStyle = (typeof MAP_STYLES)[number];

export const DEFAULT_MAP_STYLE: MapStyle = MAP_STYLES[2];
const listeners = new Set<() => void>();

function storageKey(userId: string | undefined) {
  return `ruta-map-style:${userId ?? "anon"}`;
}

function read(userId: string | undefined): MapStyle {
  try {
    const saved = localStorage.getItem(storageKey(userId));
    return MAP_STYLES.find((style) => style.id === saved) ?? DEFAULT_MAP_STYLE;
  } catch {
    return DEFAULT_MAP_STYLE;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Guarda el estilo preferido de un usuario en este dispositivo. */
export function saveMapStyle(userId: string | undefined, id: MapStyle["id"]) {
  try {
    localStorage.setItem(storageKey(userId), id);
  } catch {
    // Sin almacenamiento (modo privado) se queda el estilo predeterminado.
  }
  listeners.forEach((listener) => listener());
}

/** Estilo de mapa elegido por el usuario en este dispositivo y la función para cambiarlo. */
export function useMapStyle() {
  const { user } = useAuth();
  const style = useSyncExternalStore(subscribe, () => read(user?.id));
  return [style, (id: MapStyle["id"]) => saveMapStyle(user?.id, id)] as const;
}
