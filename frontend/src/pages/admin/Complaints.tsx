import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { splitLabel, when } from "../../lib/format.ts";
import { RideDrawer } from "./Rides.tsx";
import { Badge, CATEGORY, Empty, Filters, Page, Panel, PersonCell, type Person } from "./ui.tsx";

type Complaint = {
  id: string;
  ride_id: string;
  author_role: "passenger" | "driver";
  category: string;
  description: string | null;
  status: string;
  origin_label: string | null;
  destination_label: string | null;
  passenger: Person;
  driver: Person;
  created_at: string | null;
};

type Author = "all" | "passenger" | "driver";
type State = "open" | "closed";

export function Complaints() {
  const [author, setAuthor] = useState<Author>("all");
  const [state, setState] = useState<State>("open");
  const [ride, setRide] = useState<string | null>(null);
  const complaints = useQuery({ queryKey: ["admin-complaints"], queryFn: () => api<Complaint[]>("/api/v1/admin/complaints") });
  const all = complaints.data ?? [];
  const isOpen = (item: Complaint) => item.status === "open" || item.status === "reviewing";
  const rows = all.filter((item) => (author === "all" || item.author_role === author) && (state === "open" ? isOpen(item) : !isOpen(item)));

  return (
    <Page
      title="Quejas"
      description="Reportes de pasajeros sobre conductores y de conductores sobre pasajeros. Un reporte de seguridad de un pasajero suspende al conductor hasta que lo revises."
    >
      <div className="flex flex-wrap gap-3">
        <Filters
          value={state}
          onChange={setState}
          options={[
            { id: "open", label: "Por atender", count: all.filter(isOpen).length },
            { id: "closed", label: "Cerradas", count: all.filter((item) => !isOpen(item)).length },
          ]}
        />
        <Filters
          value={author}
          onChange={setAuthor}
          options={[
            { id: "all", label: "Todas" },
            { id: "passenger", label: "De pasajeros" },
            { id: "driver", label: "De conductores" },
          ]}
        />
      </div>
      {rows.length === 0 && complaints.isSuccess && (
        <Panel className="mt-4">
          <Empty title={state === "open" ? "No hay quejas por atender" : "No hay quejas cerradas"} />
        </Panel>
      )}
      <div className="mt-4 space-y-3">
        {rows.map((item) => <ComplaintCard key={item.id} item={item} onRide={() => setRide(item.ride_id)} />)}
      </div>
      {ride && <RideDrawer id={ride} onClose={() => setRide(null)} />}
    </Page>
  );
}

function ComplaintCard({ item, onRide }: { item: Complaint; onRide: () => void }) {
  const queryClient = useQueryClient();
  const review = useMutation({
    mutationFn: (status: string) => api(`/api/v1/admin/complaints/${item.id}`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-counts"] });
    },
  });
  const byDriver = item.author_role === "driver";
  const safety = item.category === "safety";

  return (
    <article className={`rounded-2xl border bg-surface p-5 ${safety && item.status === "open" ? "border-danger" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-bold">
            {CATEGORY[item.category] ?? item.category}
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${byDriver ? "bg-info-soft text-info-strong" : "bg-foam text-muted"}`}>
              {byDriver ? "Reporte de conductor" : "Reporte de pasajero"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {when(item.created_at)} · {splitLabel(item.origin_label).place} → {splitLabel(item.destination_label).place}
          </p>
        </div>
        <Badge status={item.status} />
      </div>
      <p className={`mt-3 text-sm ${item.description ? "" : "text-muted"}`}>{item.description ?? "Sin descripción."}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-foam p-3"><PersonCell person={item.passenger} role={byDriver ? "Pasajero reportado" : "Pasajero que reporta"} /></div>
        <div className="rounded-xl bg-foam p-3"><PersonCell person={item.driver} role={byDriver ? "Conductor que reporta" : "Conductor reportado"} /></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="line" className="w-auto" onClick={onRide}>Ver viaje</Button>
        {item.status === "open" && (
          <Button size="sm" variant="line" className="w-auto" disabled={review.isPending} onClick={() => review.mutate("reviewing")}>Marcar en revisión</Button>
        )}
        {(item.status === "open" || item.status === "reviewing") && (
          <>
            <Button size="sm" className="w-auto" disabled={review.isPending} onClick={() => review.mutate("resolved")}>Resolver</Button>
            <Button size="sm" variant="ghost" className="w-auto" disabled={review.isPending} onClick={() => review.mutate("dismissed")}>Descartar</Button>
          </>
        )}
      </div>
    </article>
  );
}
