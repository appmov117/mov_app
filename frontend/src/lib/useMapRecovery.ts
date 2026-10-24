import type { Map as MapboxMap } from "mapbox-gl";
import { useCallback, useRef, useState } from "react";

/** Espera antes de recrear el mapa: si el navegador restaura el contexto solo, no hace falta. */
const RESTORE_WAIT_MS = 800;

/**
 * Recrea el mapa cuando el teléfono libera su memoria gráfica (WebGL), algo común en iPhone al
 * cambiar de app: sin esto el mapa queda en blanco al volver.
 *
 * Returns:
 *   `key` para el componente Map (cambia al recrearlo) y `watch`, que se llama en su onLoad.
 */
export function useMapRecovery() {
  const [key, setKey] = useState(0);
  const timer = useRef(0);

  const watch = useCallback((map: MapboxMap) => {
    map.on("webglcontextlost", () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setKey((value) => value + 1), RESTORE_WAIT_MS);
    });
    map.on("webglcontextrestored", () => window.clearTimeout(timer.current));
  }, []);

  return { key, watch };
}
