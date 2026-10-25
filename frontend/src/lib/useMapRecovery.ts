import type { Map as MapboxMap } from "mapbox-gl";
import { useCallback, useEffect, useRef, useState } from "react";

/** Espera antes de recrear el mapa: si el navegador restaura el contexto solo, no hace falta. */
const RESTORE_WAIT_MS = 800;
/** Si el estilo no termina de cargar en este tiempo (red cortada, descarga suspendida), se reintenta. */
const LOAD_TIMEOUT_MS = 12_000;

/** True si el navegador ya liberó la memoria gráfica del mapa, aunque no lo haya avisado. */
function contextLost(map: MapboxMap) {
  const canvas = map.getCanvas();
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  return gl == null || gl.isContextLost();
}

/**
 * Recrea el mapa cuando el navegador libera su memoria gráfica (WebGL), algo común al cambiar de
 * pestaña o de app: sin esto el mapa queda en blanco o congelado al volver.
 *
 * Al regresar a la pestaña se revisa el mapa: si perdió su contexto o nunca terminó de cargar se
 * recrea; si no, se ajusta a su tamaño y se vuelve a dibujar. Un mapa que no carga en 12 s también
 * se recrea. Mientras la pestaña está oculta no se recrea, porque un mapa nuevo en segundo plano
 * tampoco llega a dibujarse.
 *
 * Returns:
 *   `key` para el componente Map (cambia al recrearlo) y `watch`, que se llama en su onLoad.
 */
export function useMapRecovery() {
  const [key, setKey] = useState(0);
  const timer = useRef(0);
  const current = useRef<MapboxMap | null>(null);
  const lost = useRef(false);
  const loaded = useRef(false);

  const recreate = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setKey((value) => value + 1), delay);
  }, []);

  const watch = useCallback(
    (map: MapboxMap) => {
      current.current = map;
      lost.current = false;
      loaded.current = true;
      map.on("webglcontextlost", () => {
        lost.current = true;
        if (document.visibilityState === "visible") recreate(RESTORE_WAIT_MS);
      });
      map.on("webglcontextrestored", () => {
        lost.current = false;
        window.clearTimeout(timer.current);
        map.triggerRepaint();
      });
    },
    [recreate],
  );

  // Cada mapa nuevo tiene un plazo para cargar; onLoad (watch) lo da por cumplido.
  useEffect(() => {
    loaded.current = false;
    current.current = null;
    const watchdog = window.setTimeout(() => {
      if (!loaded.current && document.visibilityState === "visible") recreate(0);
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(watchdog);
  }, [key, recreate]);

  useEffect(() => {
    function revisit() {
      if (document.visibilityState !== "visible") return;
      if (!loaded.current) {
        recreate(0);
        return;
      }
      const map = current.current;
      // Un mapa ya desmontado deja su lienzo fuera de la página.
      if (!map || !map.getCanvas().isConnected) return;
      if (lost.current || contextLost(map)) {
        recreate(0);
        return;
      }
      map.resize();
      map.triggerRepaint();
    }
    document.addEventListener("visibilitychange", revisit);
    // Safari restaura la página desde su caché sin avisar con visibilitychange.
    window.addEventListener("pageshow", revisit);
    return () => {
      document.removeEventListener("visibilitychange", revisit);
      window.removeEventListener("pageshow", revisit);
      window.clearTimeout(timer.current);
    };
  }, [recreate]);

  return { key, watch };
}
