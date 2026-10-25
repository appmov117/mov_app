import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Field, Input } from "../../components/ui/input.tsx";
import { api } from "../../lib/api.ts";
import { pesos } from "../../lib/format.ts";
import { Page, Panel } from "./ui.tsx";

export type Tariff = { base: number; per_km: number };
export type TariffSet = { auto: Tariff; moto: Tariff };
type Kind = keyof TariffSet;

const KINDS: { id: Kind; title: string }[] = [
  { id: "auto", title: "Auto" },
  { id: "moto", title: "Moto" },
];
const SAMPLE_KM = [3, 5, 10];
/** Mismo descuento que aplica el servidor a los paquetes sobre la tarifa de auto. */
const PACKAGE_FACTOR = 0.7;

export function useTariffs() {
  return useQuery({ queryKey: ["admin-tariffs"], queryFn: () => api<TariffSet>("/api/v1/admin/tariffs") });
}

export function tripPrice(tariff: Tariff, distanceKm: number) {
  return tariff.base + tariff.per_km * distanceKm;
}

export function Tariffs() {
  const queryClient = useQueryClient();
  const current = useTariffs();
  // Sin editar, el formulario muestra las tarifas guardadas.
  const [draft, setDraft] = useState<TariffSet | null>(null);
  const values = draft ?? current.data;
  const save = useMutation({
    mutationFn: (body: TariffSet) => api<TariffSet>("/api/v1/admin/tariffs", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-tariffs"], data);
      setDraft(null);
    },
  });
  const valid = values != null && KINDS.every(({ id }) => values[id].base >= 0 && values[id].per_km > 0);

  function change(kind: Kind, field: keyof Tariff, value: string) {
    if (!values) return;
    setDraft({ ...values, [kind]: { ...values[kind], [field]: Number(value) } });
  }

  return (
    <Page
      title="Tarifas"
      description="Tarifa mínima de cada viaje: banderazo más el costo por kilómetro de la ruta. El conductor puede cobrarla o proponer un precio mayor, nunca menor."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (values && valid) save.mutate(values);
        }}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {KINDS.map(({ id, title }) => (
            <Panel key={id} title={title}>
              <div className="grid grid-cols-2 gap-3 p-5">
                <Field label="Banderazo (MXN)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1000}
                    step="0.5"
                    value={values?.[id].base ?? ""}
                    onChange={(event) => change(id, "base", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Costo por km (MXN)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={1000}
                    step="0.5"
                    value={values?.[id].per_km ?? ""}
                    onChange={(event) => change(id, "per_km", event.target.value)}
                    required
                  />
                </Field>
              </div>
              {values && (
                <p className="border-t border-line px-5 py-3 text-sm text-muted">
                  Ejemplos: {SAMPLE_KM.map((distance) => `${distance} km ${pesos(tripPrice(values[id], distance))}`).join(" · ")}
                  {id === "auto" && ` · Paquete de 5 km ${pesos(tripPrice(values.auto, 5) * PACKAGE_FACTOR)}`}
                </p>
              )}
            </Panel>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button type="submit" className="sm:w-auto" disabled={!draft || !valid || save.isPending}>
            {save.isPending ? "Guardando" : "Guardar tarifas"}
          </Button>
          <p className={`text-sm ${save.isError ? "text-danger" : "text-muted"}`} role={save.isError ? "alert" : undefined}>
            {save.isError
              ? save.error instanceof Error ? save.error.message : "No se pudieron guardar"
              : save.isSuccess && !draft
                ? "Guardadas. Las solicitudes nuevas ya usan estas tarifas."
                : "Los paquetes se cobran al 70 % de la tarifa de auto."}
          </p>
        </div>
      </form>
    </Page>
  );
}
