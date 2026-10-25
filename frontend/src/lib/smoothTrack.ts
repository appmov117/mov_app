import type { Pin } from "../components/MapView.tsx";
import { distanceM } from "./guidance.ts";

/** Más allá de esta distancia entre lecturas no se anima: el carro aparece directo en su lugar. */
const SNAP_M = 500;
/** Por debajo de este avance el rumbo calculado por movimiento es solo ruido del GPS. */
const MIN_HEADING_MOVE_M = 4;
const MIN_GLIDE_MS = 300;
const MAX_GLIDE_MS = 3000;
/** Tiempo de respuesta del giro: suficiente para absorber el temblor del rumbo sin retrasarlo. */
const TURN_MS = 350;

function bearingBetween(a: Pin, b: Pin) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.longitude - a.longitude) * rad) * Math.cos(b.latitude * rad);
  const x =
    Math.cos(a.latitude * rad) * Math.sin(b.latitude * rad) -
    Math.sin(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.cos((b.longitude - a.longitude) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Diferencia más corta entre dos rumbos, en el rango [-180, 180). */
function turnBetween(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Posición del carro que se desliza entre lecturas del GPS en lugar de saltar, con un rumbo
 * que gira suave por el lado más corto. Se avanza con `step` en cada cuadro.
 */
export function createTrack() {
  let from: Pin | null = null;
  let to: Pin | null = null;
  let shown: Pin | null = null;
  let start = 0;
  let glide = 0;
  let lastPushAt = 0;
  let lastStepAt = 0;
  let targetHeading: number | null = null;
  let heading: number | null = null;

  return {
    /** Registra una lectura nueva; el rumbo del GPS manda y, sin él, se usa el del avance. */
    push(pin: Pin, gpsHeading: number | null, now = performance.now()) {
      const valid = gpsHeading != null && !Number.isNaN(gpsHeading) && gpsHeading >= 0;
      if (to && distanceM(to, pin) < 0.5) {
        if (valid) targetHeading = gpsHeading;
        return;
      }
      if (valid) targetHeading = gpsHeading;
      else if (to && distanceM(to, pin) >= MIN_HEADING_MOVE_M) targetHeading = bearingBetween(to, pin);
      const jump = !shown || distanceM(shown, pin) > SNAP_M;
      from = jump ? pin : shown;
      to = pin;
      start = now;
      // Se desliza durante el tiempo que tardó en llegar esta lectura: así llega justo con la siguiente.
      glide = jump ? 0 : Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, now - lastPushAt));
      lastPushAt = now;
      if (jump) shown = pin;
      if (heading == null) heading = targetHeading;
    },
    clear() {
      from = to = shown = null;
      targetHeading = heading = null;
    },
    /** Avanza la animación; devuelve true si algo cambió y hay que redibujar. */
    step(now = performance.now()) {
      const dt = lastStepAt ? Math.min(100, now - lastStepAt) : 16;
      lastStepAt = now;
      let changed = false;
      if (from && to && shown && (shown.latitude !== to.latitude || shown.longitude !== to.longitude)) {
        const t = glide > 0 ? Math.min(1, (now - start) / glide) : 1;
        shown = {
          latitude: from.latitude + (to.latitude - from.latitude) * t,
          longitude: from.longitude + (to.longitude - from.longitude) * t,
        };
        changed = true;
      }
      if (targetHeading != null && heading != null) {
        const turn = turnBetween(heading, targetHeading);
        if (Math.abs(turn) > 0.1) {
          heading = (heading + turn * (1 - Math.exp(-dt / TURN_MS)) + 360) % 360;
          changed = true;
        } else if (heading !== targetHeading) {
          heading = targetHeading;
          changed = true;
        }
      }
      return changed;
    },
    pin: () => shown,
    heading: () => heading,
  };
}
