import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { api } from "../../lib/api.ts";
import { Panel } from "./ui.tsx";

type Band = { start: string; end: string; percent: number; label: string };
type Config = { bands: Band[]; special: { active: boolean; percent: number; label: string } };

/** Recargos sobre la tarifa mínima: franjas horarias automáticas y una tarifa especial manual. */
export function Surcharges() {
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["admin-surcharges"], queryFn: () => api<Config>("/api/v1/admin/surcharges") });
  const [draft, setDraft] = useState<Config | null>(null);
  const config = draft ?? current.data;
  const save = useMutation({
    mutationFn: (body: Config) => api<Config>("/api/v1/admin/surcharges", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-surcharges"], data);
      setDraft(null);
    },
  });
  if (!config) return null;

  const setBand = (index: number, patch: Partial<Band>) =>
    setDraft({ ...config, bands: config.bands.map((band, position) => (position === index ? { ...band, ...patch } : band)) });
  const setSpecial = (patch: Partial<Config["special"]>) => setDraft({ ...config, special: { ...config.special, ...patch } });

  return (
    <Panel title="Recargos por horario" className="mt-6">
      <div className="space-y-3 p-5">
        <p className="text-sm text-muted">Se suman a la tarifa mínima. De las franjas que coincidan se aplica la mayor; la tarifa especial se suma encima.</p>
        {config.bands.map((band, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
            <Input value={band.label} aria-label="Nombre de la franja" maxLength={40} onChange={(event) => setBand(index, { label: event.target.value })} />
            <Input type="time" className="w-28" aria-label="Desde" value={band.start} onChange={(event) => setBand(index, { start: event.target.value })} />
            <Input type="time" className="w-28" aria-label="Hasta" value={band.end} onChange={(event) => setBand(index, { end: event.target.value })} />
            <Input type="number" className="w-20" aria-label="Porcentaje" min={1} max={200} value={band.percent} onChange={(event) => setBand(index, { percent: Number(event.target.value) })} />
            <button type="button" aria-label="Quitar franja" className="grid h-10 w-10 place-items-center rounded-full text-danger" onClick={() => setDraft({ ...config, bands: config.bands.filter((_, position) => position !== index) })}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {config.bands.length < 6 && (
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-strong"
            onClick={() => setDraft({ ...config, bands: [...config.bands, { start: "22:00", end: "06:00", percent: 20, label: "Nocturna" }] })}
          >
            <Plus size={16} /> Agregar franja
          </button>
        )}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-foam p-3">
          <button
            role="switch"
            aria-checked={config.special.active}
            aria-label="Tarifa especial"
            className={`relative h-7 w-12 rounded-full transition ${config.special.active ? "bg-ok" : "bg-ink/15"}`}
            onClick={() => setSpecial({ active: !config.special.active })}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${config.special.active ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <Input value={config.special.label} aria-label="Nombre de la tarifa especial" maxLength={40} onChange={(event) => setSpecial({ label: event.target.value })} />
          <Input type="number" className="w-20" aria-label="Porcentaje de la tarifa especial" min={0} max={200} value={config.special.percent} onChange={(event) => setSpecial({ percent: Number(event.target.value) })} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" className="sm:w-auto" disabled={!draft || save.isPending} onClick={() => draft && save.mutate(draft)}>
            {save.isPending ? "Guardando" : "Guardar recargos"}
          </Button>
          <p className={`text-sm ${save.isError ? "text-danger" : "text-muted"}`} role={save.isError ? "alert" : undefined}>
            {save.isError
              ? save.error instanceof Error ? save.error.message : "No se pudieron guardar"
              : save.isSuccess && !draft
                ? "Guardados. Los pasajeros ven el aviso de tarifas más altas."
                : "Ejemplo: Nocturna de 22:00 a 06:00 con +20 %; Lluvia con +15 % mientras esté encendida."}
          </p>
        </div>
      </div>
    </Panel>
  );
}
