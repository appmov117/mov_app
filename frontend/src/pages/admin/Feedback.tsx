import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Stars } from "../../components/ui/stars.tsx";
import { api } from "../../lib/api.ts";
import { when } from "../../lib/format.ts";
import { RideDrawer } from "./Rides.tsx";
import { Empty, Filters, Kpi, Page, Panel, type Person } from "./ui.tsx";

type Opinion = {
  id: string;
  ride_id: string;
  author_role: "passenger" | "driver";
  rating: number;
  comment: string | null;
  passenger: Person;
  driver: Person;
  created_at: string | null;
};
type FeedbackData = { average_by_passengers: number | null; average_by_drivers: number | null; items: Opinion[] };
type Author = "all" | "passenger" | "driver";
type Show = "all" | "comments" | "low";

export function Feedback() {
  const [author, setAuthor] = useState<Author>("all");
  const [show, setShow] = useState<Show>("all");
  const [ride, setRide] = useState<string | null>(null);
  const feedback = useQuery({ queryKey: ["admin-feedback"], queryFn: () => api<FeedbackData>("/api/v1/admin/feedback") });
  const data = feedback.data;
  const rows = (data?.items ?? []).filter(
    (item) =>
      (author === "all" || item.author_role === author) &&
      (show === "all" || (show === "comments" ? Boolean(item.comment) : item.rating <= 3)),
  );

  return (
    <Page title="Opiniones" description="Lo que pasajeros y conductores dicen al calificar cada viaje. Las de 3 estrellas o menos suelen anticipar una queja.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Pasajeros califican a conductores" value={data?.average_by_passengers != null ? `${data.average_by_passengers.toFixed(1)} ★` : "—"} tone="brand" />
        <Kpi label="Conductores califican a pasajeros" value={data?.average_by_drivers != null ? `${data.average_by_drivers.toFixed(1)} ★` : "—"} />
        <Kpi label="Opiniones de 3 ★ o menos" value={String((data?.items ?? []).filter((item) => item.rating <= 3).length)} tone="warn" />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Filters
          value={author}
          onChange={setAuthor}
          options={[
            { id: "all", label: "Todas" },
            { id: "passenger", label: "De pasajeros" },
            { id: "driver", label: "De conductores" },
          ]}
        />
        <Filters
          value={show}
          onChange={setShow}
          options={[
            { id: "all", label: "Todas" },
            { id: "comments", label: "Con comentario" },
            { id: "low", label: "3 ★ o menos" },
          ]}
        />
      </div>
      <Panel className="mt-4">
        {rows.length === 0 && feedback.isSuccess && <Empty title="No hay opiniones con este filtro" />}
        {rows.map((item) => {
          const from = item.author_role === "passenger" ? item.passenger : item.driver;
          const to = item.author_role === "passenger" ? item.driver : item.passenger;
          return (
            <button key={item.id} type="button" className="block w-full border-b border-line px-5 py-4 text-left last:border-0 hover:bg-foam/60" onClick={() => setRide(item.ride_id)}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={item.rating} size={16} />
                <span className="text-xs text-muted">{when(item.created_at)}</span>
              </span>
              <span className={`mt-2 block text-sm ${item.comment ? "" : "text-muted"}`}>{item.comment ? `“${item.comment}”` : "Sin comentario"}</span>
              <span className="mt-2 block text-xs text-muted">
                {item.author_role === "passenger" ? "Pasajero" : "Conductor"} {from?.name ?? "—"} sobre {item.author_role === "passenger" ? "el conductor" : "el pasajero"} {to?.name ?? "—"}
              </span>
            </button>
          );
        })}
      </Panel>
      {ride && <RideDrawer id={ride} onClose={() => setRide(null)} />}
    </Page>
  );
}
