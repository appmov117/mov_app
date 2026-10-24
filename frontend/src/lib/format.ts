export function pesos(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function km(meters: number | null | undefined) {
  if (meters == null) return "—";
  return `${(meters / 1000).toFixed(1)} km`;
}

export function minutes(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const total = Math.max(1, Math.round(seconds / 60));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `${hours} h ${rest} min`;
}

export function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

export function percent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function when(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayGroup(iso: string | null | undefined) {
  if (!iso) return "Antes";
  const date = new Date(iso);
  const today = new Date();
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function statusLabel(status: string) {
  if (status === "completed") return "Completado";
  if (status === "cancelled") return "Cancelado";
  return "En curso";
}

export function clockTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/** Separa "Lugar, ciudad · Servicio" en el nombre corto del lugar y el servicio. */
export function splitLabel(label: string | null | undefined) {
  if (!label) return { place: "Viaje", service: null };
  const [head, service] = label.split(" · ");
  return { place: head.split(",")[0], service: service ?? null };
}

export function payLabel(method: string | null | undefined) {
  if (method === "driver_terminal") return "Terminal del conductor";
  if (method === "other") return "Otro";
  return "Efectivo";
}
