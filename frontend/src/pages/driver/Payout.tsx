import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../../components/Shell.tsx";
import type { Payout } from "../../components/TripCodes.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Field, Input } from "../../components/ui/input.tsx";
import { api } from "../../lib/api.ts";

/** CLABE, banco y titular: el pasajero los ve durante el viaje para pagarte por transferencia. */
export function DriverPayout() {
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["payout"], queryFn: () => api<Payout | null>("/api/v1/drivers/me/payout") });
  const [draft, setDraft] = useState<Payout | null>(null);
  const form = draft ?? saved.data ?? { clabe: "", bank: "", holder: "" };
  const save = useMutation({
    mutationFn: () => api<Payout>("/api/v1/drivers/me/payout", { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["payout"], data);
      queryClient.invalidateQueries({ queryKey: ["driver"] });
      setDraft(null);
    },
  });
  const set = (key: keyof Payout, value: string) => setDraft({ ...form, [key]: value });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col px-4 py-5">
        <Link to="/conductor/perfil" className="flex items-center gap-1 text-sm font-semibold">
          <ChevronLeft size={18} /> Perfil
        </Link>
        <h1 className="mt-3 text-[28px] font-extrabold tracking-tight">Datos de pago</h1>
        <p className="mt-1 text-sm text-muted">El pasajero los ve durante el viaje para pagarte por transferencia. Solo se muestran a quien viaja contigo.</p>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <Field label="CLABE (18 dígitos)">
            <Input
              inputMode="numeric"
              value={form.clabe}
              onChange={(event) => set("clabe", event.target.value.replace(/\D/g, "").slice(0, 18))}
              required
              minLength={18}
            />
          </Field>
          <Field label="Banco">
            <Input value={form.bank} onChange={(event) => set("bank", event.target.value)} required minLength={2} maxLength={60} />
          </Field>
          <Field label="Titular de la cuenta">
            <Input value={form.holder} onChange={(event) => set("holder", event.target.value)} required minLength={3} maxLength={100} />
          </Field>
          {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
          {save.isSuccess && !draft && <p className="text-sm text-ok-strong">Guardado. Ya apareces como "acepta transferencia".</p>}
          <Button type="submit" disabled={!draft || form.clabe.length !== 18 || save.isPending}>
            {save.isPending ? "Guardando" : "Guardar"}
          </Button>
        </form>
      </div>
    </Shell>
  );
}
