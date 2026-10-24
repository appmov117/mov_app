import { useSyncExternalStore } from "react";

const query = "(min-width: 1024px)";

function subscribe(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

/** True en pantallas anchas (iPad horizontal y escritorio), donde el panel flota a la izquierda del mapa. */
export function useWide() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Ancho del panel flotante más sus márgenes; el mapa lo usa para no encuadrar la ruta debajo de él. */
export const PANEL_OFFSET = 448;
