import { Motorbike, Car, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { initials } from "../lib/format.ts";
import { AmenityIcons, type Amenities } from "./TripCodes.tsx";

export type DriverVehicle = { brand: string; model: string; year?: number | null; color: string | null; plate: string; kind?: "auto" | "moto" };
export type DriverInfo = { name: string; rating: number; avatar_url?: string | null; vehicle: DriverVehicle | null; amenities?: Amenities };

const VEHICLE_COLORS: Record<string, string> = {
  blanco: "#f8fafc",
  negro: "#111827",
  gris: "#9ca3af",
  plata: "#cbd5e1",
  plateado: "#cbd5e1",
  rojo: "#dc2626",
  azul: "#2563eb",
  verde: "#16a34a",
  amarillo: "#facc15",
  naranja: "#f97316",
  cafe: "#78350f",
  café: "#78350f",
  beige: "#e7d7b9",
  vino: "#7f1d1d",
  dorado: "#ca8a04",
};

/** Foto de perfil del conductor, o sus iniciales si no ha subido una. */
export function DriverAvatar({ driver, size = "h-12 w-12 text-base" }: { driver: DriverInfo; size?: string }) {
  return driver.avatar_url ? (
    <img src={driver.avatar_url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-foam font-extrabold text-ink`}>{initials(driver.name)}</span>
  );
}

function VehicleRow({ vehicle }: { vehicle: DriverVehicle }) {
  const swatch = vehicle.color ? VEHICLE_COLORS[vehicle.color.trim().toLowerCase()] : undefined;
  const Kind = vehicle.kind === "moto" ? Motorbike : Car;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-foam px-3 py-2.5">
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ink/15 shadow-inner" style={{ background: swatch ?? "#e6e8ec" }}>
        <Kind size={15} className={swatch === "#111827" || swatch === "#7f1d1d" ? "text-white" : "text-ink/70"} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">
          {vehicle.brand} {vehicle.model}
          {vehicle.year ? ` ${vehicle.year}` : ""}
        </span>
        <span className="block text-xs capitalize text-muted">
          {[vehicle.kind === "moto" ? "Moto" : "Auto", vehicle.color].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="rounded-md border-2 border-ink bg-surface px-2 py-0.5 font-mono text-base font-extrabold tracking-[0.15em]" aria-label={`Placa ${vehicle.plate}`}>
        {vehicle.plate}
      </span>
    </div>
  );
}

/** Foto grande del conductor con los datos de su vehículo, para reconocerlo al llegar. */
function DriverSheet({ driver, onClose }: { driver: DriverInfo; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  // Fuera del panel inferior: su animación usa transform y limitaría el fondo a ese panel.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`Perfil de ${driver.name}`} onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-end">
          <button type="button" aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-foam" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          <DriverAvatar driver={driver} size="h-40 w-40 text-4xl" />
          <p className="mt-3 text-xl font-extrabold">{driver.name}</p>
          <p className="text-sm text-muted">★ {driver.rating.toFixed(1)} · Conductor verificado</p>
          <AmenityIcons amenities={driver.amenities} className="mt-3 justify-center" />
        </div>
        {driver.vehicle && (
          <div className="mt-4">
            <VehicleRow vehicle={driver.vehicle} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Tarjeta del conductor asignado: foto (se amplía al tocarla), calificación, preferencias y vehículo. */
export function DriverCard({ driver }: { driver: DriverInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-2xl border border-line p-3">
      <button type="button" className="flex w-full items-center gap-3 text-left" aria-label={`Ver perfil de ${driver.name}`} onClick={() => setOpen(true)}>
        <DriverAvatar driver={driver} size="h-14 w-14 text-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{driver.name}</span>
          <span className="block text-sm text-muted">★ {driver.rating.toFixed(1)} · Conductor verificado</span>
          <span className="block text-xs font-semibold text-brand-strong">Ver perfil</span>
        </span>
      </button>
      <AmenityIcons amenities={driver.amenities} className="mt-3" />
      {driver.vehicle && (
        <div className="mt-3">
          <VehicleRow vehicle={driver.vehicle} />
        </div>
      )}
      {open && <DriverSheet driver={driver} onClose={() => setOpen(false)} />}
    </div>
  );
}
