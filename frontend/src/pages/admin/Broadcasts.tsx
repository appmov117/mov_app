import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { when } from "../../lib/format.ts";
import { Empty, Filters, Page, Panel } from "./ui.tsx";

type Audience = "drivers" | "passengers" | "all";
type Sent = { id: number; audience: Audience; title: string; body: string; count: number; created_at: string | null };

const AUDIENCE: Record<Audience, string> = { drivers: "Conductores", passengers: "Pasajeros", all: "Todos" };

export function Broadcasts() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<Audience>("drivers");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const history = useQuery({ queryKey: ["admin-broadcasts"], queryFn: () => api<Sent[]>("/api/v1/admin/notifications") });
  const send = useMutation({
    mutationFn: () => api<{ count: number }>("/api/v1/admin/notifications", { method: "POST", body: JSON.stringify({ audience, title, body }) }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    },
  });

  return (
    <Page title="Avisos" description="Envía un aviso a conductores, pasajeros o a todos. Llega como notificación del teléfono y queda en la app.">
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel title="Nuevo aviso">
          <form
            className="space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <div>
              <p className="mb-2 text-sm font-semibold">Para</p>
              <Filters value={audience} onChange={setAudience} options={(Object.keys(AUDIENCE) as Audience[]).map((id) => ({ id, label: AUDIENCE[id] }))} />
            </div>
            <label className="block text-sm font-semibold">
              Título
              <input
                value={title}
                maxLength={80}
                required
                placeholder="Ej. Nueva zona de servicio"
                className="mt-1.5 h-11 w-full rounded-xl border border-line px-3 font-normal outline-none focus:border-ink"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Mensaje
              <textarea
                value={body}
                maxLength={500}
                required
                rows={4}
                placeholder="Ej. Desde el lunes también atendemos García Ginerés."
                className="mt-1.5 w-full rounded-xl border border-line p-3 font-normal outline-none focus:border-ink"
                onChange={(event) => setBody(event.target.value)}
              />
              <span className="mt-1 block text-right text-xs font-normal text-muted tabular-nums">{body.length}/500</span>
            </label>
            <div className="rounded-xl bg-foam p-3">
              <p className="mb-2 text-xs text-muted">Así se verá en el teléfono</p>
              <div className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white"><Bell size={16} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{title || "Título del aviso"}</span>
                  <span className="line-clamp-2 block text-sm text-muted">{body || "El mensaje aparece aquí."}</span>
                </span>
              </div>
            </div>
            {send.error && <p className="text-sm text-danger">{(send.error as Error).message}</p>}
            {send.data && !send.isPending && <p className="text-sm font-semibold text-ok-strong">Aviso enviado a {send.data.count} personas.</p>}
            <Button type="submit" disabled={!title.trim() || !body.trim() || send.isPending}>
              {send.isPending ? "Enviando" : `Enviar a ${AUDIENCE[audience].toLowerCase()}`}
            </Button>
          </form>
        </Panel>
        <Panel title="Enviados">
          {history.data?.length === 0 && <Empty title="Todavía no envías avisos" />}
          {history.data?.map((item) => (
            <div key={item.id} className="border-b border-line px-5 py-3 last:border-0">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-0.5 text-sm text-muted">{item.body}</p>
              <p className="mt-1 text-xs text-muted">{AUDIENCE[item.audience]} · {item.count} personas · {when(item.created_at)}</p>
            </div>
          ))}
        </Panel>
      </div>
    </Page>
  );
}
