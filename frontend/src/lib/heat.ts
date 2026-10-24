/**
 * Escala de calor para zonas de demanda: de casi blanco (poca) a amarillo, naranja y rojo (mucha).
 * El tono más claro tiene un toque de amarillo para que se distinga del mapa claro.
 */
export const HEAT_RAMP = ["#fefce8", "#fde047", "#fb923c", "#ef4444", "#991b1b"] as const;

/** Expresión de Mapbox que colorea cada zona según su `count`, de 1 al máximo de la vista. */
export function heatFill(max: number) {
  const top = Math.max(2, max);
  const stops = HEAT_RAMP.flatMap((color, index) => [1 + ((top - 1) * index) / (HEAT_RAMP.length - 1), color]);
  return ["interpolate", ["linear"], ["get", "count"], ...stops] as unknown as string;
}

/** Contorno que marca las zonas con solicitudes que nadie tomó; oscuro para no confundirse con la escala. */
export const UNSERVED_LINE = "#14232b";
