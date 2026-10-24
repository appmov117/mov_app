import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { api, apiBlob } from "../../lib/api.ts";
import { when } from "../../lib/format.ts";
import { Badge, Empty, Page, Panel, PersonCell, type Person } from "./ui.tsx";

export type Alert = {
  id: string;
  ride_id: string;
  status: string;
  location: { latitude: number; longitude: number } | null;
  created_at: string | null;
  passenger: Person;
  driver: Person;
  plate: string | null;
};

type Recording = {
  id: string;
  ride_id: string;
  session_id: string;
  segment: number;
  kind: "audio" | "video";
  created_at: string | null;
  passenger: Person;
  driver: Person;
  plate: string | null;
};

export function Safety({ alerts }: { alerts: Alert[] }) {
  const queryClient = useQueryClient();
  const recordings = useQuery({ queryKey: ["admin-recordings"], queryFn: () => api<Recording[]>("/api/v1/admin/safety/recordings") });
  const attend = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/safety/alerts/${id}/attend`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
  });
  const sessions = new Map<string, Recording[]>();
  for (const row of recordings.data ?? []) sessions.set(row.session_id, [...(sessions.get(row.session_id) ?? []), row]);

  return (
    <Page title="Seguridad" description="Alertas de pánico enviadas desde un viaje y las grabaciones de audio o video que hizo el pasajero.">
      <Panel title="Alertas de pánico">
        {alerts.length === 0 && <Empty title="Sin alertas" detail="Cuando un pasajero toca el botón de seguridad, la alerta aparece aquí y suena en este equipo si activaste las alertas." />}
        {alerts.map((alert) => (
          <article key={alert.id} className={`border-b border-line px-5 py-4 last:border-0 ${alert.status === "open" ? "bg-[#fff5f7]" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{when(alert.created_at)}</p>
              <Badge status={alert.status} label={alert.status === "open" ? "Abierta" : "Atendida"} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 ring-1 ring-line"><PersonCell person={alert.passenger} role="Pasajero" /></div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-line"><PersonCell person={alert.driver ? { ...alert.driver, plate: alert.plate } : null} role="Conductor" /></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {alert.location && (
                <a
                  className="inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-semibold"
                  href={`https://maps.google.com/?q=${alert.location.latitude},${alert.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver ubicación
                </a>
              )}
              {alert.status === "open" && (
                <Button size="sm" className="w-auto" disabled={attend.isPending} onClick={() => attend.mutate(alert.id)}>
                  Marcar atendida
                </Button>
              )}
            </div>
          </article>
        ))}
      </Panel>

      <Panel title="Grabaciones" className="mt-6">
        {sessions.size === 0 && <Empty title="Sin grabaciones" />}
        {[...sessions.values()].map((segments) => {
          const ordered = [...segments].sort((a, b) => a.segment - b.segment);
          const first = ordered[0];
          return (
            <article key={first.session_id} className="border-b border-line px-5 py-4 last:border-0">
              <p className="font-bold">
                {first.kind === "video" ? "Video" : "Audio"} · {when(first.created_at)} · {ordered.length} {ordered.length === 1 ? "parte" : "partes"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Pasajero {first.passenger?.name ?? "—"} · Conductor {first.driver?.name ?? "—"}{first.plate ? ` · ${first.plate}` : ""}
              </p>
              <div className="mt-3 space-y-2">
                {ordered.map((segment) => <Player key={segment.id} recording={segment} />)}
              </div>
            </article>
          );
        })}
      </Panel>
    </Page>
  );
}

function Player({ recording }: { recording: Recording }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setUrl(URL.createObjectURL(await apiBlob(`/api/v1/admin/safety/recordings/${recording.id}/file`)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    return recording.kind === "video" ? (
      <video src={url} controls playsInline className="w-full max-w-xl rounded-xl bg-ink" />
    ) : (
      <audio src={url} controls className="w-full max-w-xl" />
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="line" className="w-auto" disabled={loading} onClick={() => void load()}>
        {loading ? "Cargando" : `Reproducir parte ${recording.segment + 1}`}
      </Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
