import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { apiBlob } from "../../lib/api.ts";

export type Person = { id?: string; name: string; phone: string; plate?: string | null; vehicle?: string | null; rating?: number } | null;

type Tone = "good" | "warn" | "bad" | "info" | "neutral";

const tones: Record<Tone, string> = {
  good: "bg-ok-soft text-ok-strong",
  warn: "bg-warn-soft text-warn",
  bad: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  neutral: "bg-foam text-muted",
};

/** Etiqueta y tono de cada estado que el panel muestra. */
const STATUS: Record<string, [string, Tone]> = {
  accepted: ["Asignado", "info"],
  driver_arriving: ["En camino", "info"],
  driver_arrived: ["Esperando pasajero", "warn"],
  in_progress: ["En viaje", "good"],
  completed: ["Completado", "neutral"],
  cancelled: ["Cancelado", "bad"],
  searching: ["Buscando conductor", "warn"],
  offered: ["Ofertado", "warn"],
  online: ["En línea", "good"],
  busy: ["En viaje", "info"],
  paused: ["En pausa", "warn"],
  offline: ["Desconectado", "neutral"],
  active: ["Vigente", "good"],
  expired: ["Vencida", "bad"],
  none: ["Sin membresía", "neutral"],
  pending: ["Por revisar", "warn"],
  approved: ["Aprobado", "good"],
  rejected: ["Rechazado", "bad"],
  open: ["Abierta", "bad"],
  reviewing: ["En revisión", "warn"],
  resolved: ["Resuelta", "good"],
  dismissed: ["Descartada", "neutral"],
  attended: ["Atendida", "neutral"],
  suspended: ["Suspendido", "bad"],
  deleted: ["Eliminada", "neutral"],
};

export const CATEGORY: Record<string, string> = {
  driving: "Manejo",
  behavior: "Trato",
  vehicle: "Vehículo",
  fare: "Cobro",
  route: "Ruta",
  safety: "Seguridad",
  no_show: "No se presentó",
  damage: "Daños al vehículo",
  other: "Otro",
};

export const PAYMENT_METHOD: Record<string, string> = {
  mercado_pago_link: "Mercado Pago",
  bank_transfer: "Transferencia",
  transfer: "Transferencia",
  cash: "Efectivo",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const [text, tone] = STATUS[status] ?? [status, "neutral" as Tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{label ?? text}</span>;
}

export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:px-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 max-w-[70ch] text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Panel({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="font-bold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "brand" | "warn" | "bad" }) {
  const color = tone === "brand" ? "text-brand-strong" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight ${color}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function Filters<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (id: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${value === option.id ? "bg-ink text-surface" : "border border-line bg-surface text-muted hover:text-ink"}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count != null && <span className="ml-1.5 tabular-nums opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-bold">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">{detail}</p>}
    </div>
  );
}

export function PersonCell({ person, role }: { person: Person; role?: string }) {
  if (!person) return <span className="text-muted">—</span>;
  return (
    <span className="block min-w-0">
      <span className="block truncate font-semibold">{person.name}</span>
      <span className="block truncate text-xs text-muted">
        {role ? `${role} · ` : ""}
        <a href={`tel:${person.phone}`} className="hover:text-ink hover:underline">{person.phone}</a>
        {person.plate ? ` · ${person.plate}` : ""}
      </span>
    </span>
  );
}

/** Panel lateral de detalle; se cierra con Esc o tocando fuera. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-night/30" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <aside className="ruta-from-right flex h-full w-full max-w-[520px] flex-col bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-foam" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

/** Los archivos subidos piden sesión: se descargan con el token y se muestran como URL local. */
export function useFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["admin-file", path],
    enabled: Boolean(path),
    staleTime: Infinity,
    queryFn: async () => {
      const blob = await apiBlob(`/api/v1/files/${path}`);
      return { url: URL.createObjectURL(blob), pdf: blob.type === "application/pdf" };
    },
  });
}

export function FilePreview({ path, alt }: { path: string | null | undefined; alt: string }) {
  const file = useFileUrl(path);
  if (!path) return <div className="grid aspect-[4/3] place-items-center rounded-xl bg-foam text-xs text-muted">Sin archivo</div>;
  if (file.isLoading) return <div className="aspect-[4/3] animate-pulse rounded-xl bg-foam" />;
  if (file.error || !file.data) return <div className="grid aspect-[4/3] place-items-center rounded-xl bg-foam text-xs text-danger">No se pudo abrir</div>;
  if (file.data.pdf) {
    return (
      <a href={file.data.url} target="_blank" rel="noreferrer" className="grid aspect-[4/3] place-items-center rounded-xl bg-foam text-sm font-semibold text-ink underline">
        Abrir PDF
      </a>
    );
  }
  return (
    <a href={file.data.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-foam">
      <img src={file.data.url} alt={alt} className="aspect-[4/3] w-full object-cover" />
    </a>
  );
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} d`;
}
