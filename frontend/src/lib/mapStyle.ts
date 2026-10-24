import type { Map as MapboxMap } from "mapbox-gl";
import { useSyncExternalStore } from "react";
import { useAuth } from "./auth.tsx";
import { useDarkMode } from "./theme.ts";

/** Del más ligero al más pesado; cada uno tiene su versión para el tema oscuro. */
export const MAP_STYLES = [
  {
    id: "light",
    label: "Ligero",
    detail: "Carga más rápido y gasta menos datos",
    url: "mapbox://styles/mapbox/light-v11",
    darkUrl: "mapbox://styles/mapbox/dark-v11",
  },
  {
    id: "streets",
    label: "Calles",
    detail: "Más colores, nombres e íconos; gasta un poco más",
    // Standard con sus modos de día y noche de fábrica: mismos íconos de lugares en claro y oscuro.
    url: "mapbox://styles/mapbox/standard",
    darkUrl: "mapbox://styles/mapbox/standard",
  },
] as const;

export type MapStyle = (typeof MAP_STYLES)[number];

export const DEFAULT_MAP_STYLE: MapStyle = MAP_STYLES[0];
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

const STANDARD_URL = "mapbox://styles/mapbox/standard";
/** Modos integrados de Standard, sin edificios 3D para no cargar la GPU del teléfono. */
const STANDARD_DAY = { basemap: { lightPreset: "day", show3dObjects: false } };
const STANDARD_NIGHT = { basemap: { lightPreset: "night", show3dObjects: false } };

/** Estilo elegido en su versión clara u oscura según el tema, con la configuración que pide Standard. */
export function useMapStyleProps() {
  const [style] = useMapStyle();
  const dark = useDarkMode();
  const url = dark ? style.darkUrl : style.url;
  return { url, config: url === STANDARD_URL ? (dark ? STANDARD_NIGHT : STANDARD_DAY) : undefined };
}

const LIGHT_URL = "mapbox://styles/mapbox/light-v11";
/** Terreno un poco más oscuro que el de fábrica para que las calles blancas resalten. */
const LIGHT_LAND = "#e3e6e9";

/**
 * Ajustes al cargar el estilo. En Light: fondo algo más oscuro. En Standard: algunas capas de
 * bardas combinan una expresión de zoom con elevación y Mapbox GL falla al evaluar line-progress,
 * así que se les fija un ancho simple.
 */
export function tuneStyle(map: MapboxMap, url: string) {
  try {
    if (url === LIGHT_URL && map.getLayer("land")) map.setPaintProperty("land", "background-color", LIGHT_LAND);
    if (url !== STANDARD_URL) return;
    for (const layer of map.getStyle().layers) {
      if (layer.type !== "line" || !layer.id.includes("gate-fence-hedge")) continue;
      if (Array.isArray(layer.paint?.["line-width"])) map.setPaintProperty(layer.id, "line-width", 1.5);
    }
  } catch {
    // El estilo aún no termina de cargar; se reintenta en el siguiente evento de estilo.
  }
}
