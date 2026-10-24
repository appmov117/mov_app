import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { when } from "../../lib/format.ts";
import { Badge, Empty, FilePreview, Filters, Page, Panel, type Person } from "./ui.tsx";

export type DriverDocument = {
  id: string;
  kind: string;
  label: string;
  status: string;
  note: string | null;
  file_url: string;
  driver: Person;
  created_at: string | null;
};

type Filter = "pending" | "approved" | "rejected";

export function Documents() {
  const [filter, setFilter] = useState<Filter>("pending");
  const docs = useQuery({
    queryKey: ["admin-documents", filter],
    queryFn: () => api<DriverDocument[]>(`/api/v1/admin/documents?status=${filter}`),
  });

  return (
    <Page
      title="Documentos de conductores"
      description="Identificación, licencia, tarjeta de circulación y fotos que suben los conductores. Al rechazar, el conductor recibe el motivo."
    >
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          { id: "pending", label: "Por revisar" },
          { id: "approved", label: "Aprobados" },
          { id: "rejected", label: "Rechazados" },
        ]}
      />
      {docs.data?.length === 0 && (
        <Panel className="mt-4">
          <Empty
            title={filter === "pending" ? "No hay documentos por revisar" : "Nada en esta lista"}
            detail="Los conductores suben sus documentos desde su perfil en la app."
          />
        </Panel>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {docs.data?.map((doc) => <DocumentCard key={doc.id} doc={doc} showDriver />)}
      </div>
    </Page>
  );
}

export function DocumentCard({ doc, showDriver = false }: { doc: DriverDocument; showDriver?: boolean }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      api(`/api/v1/admin/documents/${doc.id}`, { method: "POST", body: JSON.stringify({ status, note: note || null }) }),
    onSuccess: () => {
      setRejecting(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-counts"] });
    },
  });

  return (
    <article className="rounded-2xl border border-line bg-white p-3">
      <FilePreview path={doc.file_url} alt={doc.label} />
      <div className="px-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold">{doc.label}</p>
            {showDriver && <p className="truncate text-sm text-muted">{doc.driver?.name ?? "Conductor"} · {doc.driver?.phone}</p>}
            <p className="text-xs text-muted">Subido {when(doc.created_at)}</p>
          </div>
          <Badge status={doc.status} />
        </div>
        {doc.note && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong">Motivo: {doc.note}</p>}
        {review.error && <p className="mt-2 text-xs text-danger">{(review.error as Error).message}</p>}
        {doc.status === "pending" && !rejecting && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" variant="line" disabled={review.isPending} onClick={() => setRejecting(true)}>Rechazar</Button>
            <Button size="sm" disabled={review.isPending} onClick={() => review.mutate("approved")}>Aprobar</Button>
          </div>
        )}
        {rejecting && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              autoFocus
              placeholder="Motivo para el conductor, p. ej. la foto está borrosa"
              className="w-full rounded-xl border border-line p-2.5 text-sm outline-none focus:border-ink"
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="line" onClick={() => setRejecting(false)}>Volver</Button>
              <Button size="sm" variant="danger" disabled={!note.trim() || review.isPending} onClick={() => review.mutate("rejected")}>
                Rechazar
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
