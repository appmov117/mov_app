import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../lib/api.ts";
import { AMENITY_LIST, type Amenities } from "./TripCodes.tsx";
import { SectionTitle } from "./ui/list.tsx";

type Props = { amenities: Amenities | undefined; requirePin: boolean | undefined };

function SwitchRow({ icon, label, detail, on, onToggle, disabled }: { icon: ReactNode; label: string; detail?: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${on ? "bg-ok/15 text-ok" : "bg-danger/10 text-danger"}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-ok" : "bg-ink/15"}`}
        onClick={onToggle}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </li>
  );
}

/** Lo que el pasajero ve como iconos en tu perfil y el código de seguridad al iniciar. */
export function DriverPreferences({ amenities, requirePin }: Props) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["driver"] });
  const saveAmenities = useMutation({
    mutationFn: (next: Amenities) => api("/api/v1/drivers/me/amenities", { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: refresh,
  });
  const savePin = useMutation({
    mutationFn: (next: boolean) => api("/api/v1/drivers/me/security", { method: "PUT", body: JSON.stringify({ require_pin: next }) }),
    onSuccess: refresh,
  });
  const error = saveAmenities.error ?? savePin.error;

  return (
    <>
      <SectionTitle>Lo que aceptas</SectionTitle>
      <ul className="rounded-2xl border border-line">
        {AMENITY_LIST.filter((item) => item.id !== "transfer").map(({ id, icon: Icon, yes }) => (
          <SwitchRow
            key={id}
            icon={<Icon size={16} />}
            label={yes}
            on={Boolean(amenities?.[id])}
            disabled={!amenities || saveAmenities.isPending}
            onToggle={() => amenities && saveAmenities.mutate({ ...amenities, [id]: !amenities[id] })}
          />
        ))}
      </ul>
      <SectionTitle>Seguridad</SectionTitle>
      <ul className="rounded-2xl border border-line">
        <SwitchRow
          icon={<ShieldCheck size={16} />}
          label="Código de seguridad"
          detail="El pasajero te da 4 dígitos para iniciar el viaje"
          on={Boolean(requirePin)}
          disabled={requirePin == null || savePin.isPending}
          onToggle={() => savePin.mutate(!requirePin)}
        />
      </ul>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{(error as Error).message}</p>}
    </>
  );
}
