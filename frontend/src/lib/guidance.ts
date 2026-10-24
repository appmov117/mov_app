import type { Pin } from "../components/MapView.tsx";

export type NavStep = {
  instruction: string;
  modifier: string | null;
  type: string | null;
  name: string | null;
  distance_m: number;
  duration_s: number;
  location: { latitude: number; longitude: number };
};

export function distanceM(a: Pin, b: Pin) {
  const radius = 6_371_000;
  const p1 = (a.latitude * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dphi = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dlmb = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function turnLabel(step: NavStep | null | undefined) {
  if (!step) return "Sigue la ruta";
  const modifier = step.modifier ?? "";
  if (step.type === "arrive") return "Llegada";
  if (modifier.includes("left")) return "Izquierda";
  if (modifier.includes("right")) return "Derecha";
  if (modifier === "uturn") return "Retorno";
  if (modifier === "straight" || step.type === "depart") return "Recto";
  return "Sigue";
}

export function turnSymbol(step: NavStep | null | undefined) {
  const label = turnLabel(step);
  if (label === "Izquierda") return "↰";
  if (label === "Derecha") return "↱";
  if (label === "Retorno") return "↩";
  if (label === "Llegada") return "●";
  return "↑";
}

/** Elige el siguiente paso de giro según la posición del carro. */
export function nextGuidance(steps: NavStep[], position: Pin | null | undefined) {
  if (!steps.length) return { step: null as NavStep | null, index: -1, distance_m: 0 };
  if (!position) {
    return { step: steps[0], index: 0, distance_m: steps[0].distance_m };
  }
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    const value = distanceM(position, step.location);
    if (value < bestDist) {
      bestDist = value;
      best = index;
    }
  });
  // Si ya pasamos el punto del paso (< 35 m), avanza al siguiente
  const index = bestDist < 35 && best < steps.length - 1 ? best + 1 : best;
  const step = steps[index];
  return {
    step,
    index,
    distance_m: Math.max(0, Math.round(distanceM(position, step.location))),
  };
}

export function metersLabel(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 100) return `${Math.round(meters / 10) * 10} m`;
  return `${Math.max(meters, 0)} m`;
}
