import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ChevronLeft, Clock, FileWarning } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";

type Doc = { id: string; kind: string; status: string; note: string | null };

const KINDS = [
  { id: "identity", label: "Identificación oficial", detail: "INE o pasaporte, por el frente" },
  { id: "license", label: "Licencia de conducir", detail: "Vigente, por el frente" },
  { id: "plate", label: "Tarjeta de circulación", detail: "Del vehículo que usarás" },
  { id: "vehicle_photo", label: "Foto del vehículo", detail: "Que se vea la placa" },
  { id: "driver_photo", label: "Tu foto", detail: "De frente y con buena luz" },
] as const;

/** El conductor sube los documentos que el administrador revisa antes de aprobarlo. */
export function DriverDocuments() {
  const docs = useQuery({ queryKey: ["driver-documents"], queryFn: () => api<Doc[]>("/api/v1/drivers/me/documents") });
  // Si subió el mismo tipo varias veces, cuenta el más reciente (el API los entrega en orden de subida).
  const latest = new Map((docs.data ?? []).map((doc) => [doc.kind, doc]));
  const approved = KINDS.filter((kind) => latest.get(kind.id)?.status === "approved").length;

  return (
    <Shell>
      <div className="px-4 py-5">
        <Link to="/conductor/perfil" className="-ml-2 inline-grid h-10 w-10 place-items-center rounded-full" aria-label="Volver al perfil">
          <ChevronLeft size={24} />
        </Link>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-muted">
          {approved === KINDS.length ? "Todos tus documentos están aprobados." : `${approved} de ${KINDS.length} aprobados. Sube una foto clara de cada uno.`}
        </p>
        <ul className="mt-5 space-y-3">
          {KINDS.map((kind) => <DocumentRow key={kind.id} kind={kind} doc={latest.get(kind.id)} />)}
        </ul>
      </div>
    </Shell>
  );
}

function DocumentRow({ kind, doc }: { kind: (typeof KINDS)[number]; doc: Doc | undefined }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("kind", kind.id);
      body.append("file", file);
      return api("/api/v1/drivers/me/documents", { method: "POST", body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["driver-documents"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo subir"),
  });
  const status = doc?.status;
  const canUpload = status !== "approved" && status !== "pending";

  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${status === "approved" ? "bg-ok-soft text-ok-strong" : status === "rejected" ? "bg-danger-soft text-danger" : status === "pending" ? "bg-warn-soft text-warn" : "bg-foam text-muted"}`}>
          {status === "approved" ? <CheckCircle2 size={20} /> : status === "rejected" ? <FileWarning size={20} /> : status === "pending" ? <Clock size={20} /> : <Camera size={20} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{kind.label}</span>
          <span className="block text-sm text-muted">
            {status === "approved" ? "Aprobado" : status === "pending" ? "En revisión" : status === "rejected" ? "Rechazado: vuelve a subirlo" : kind.detail}
          </span>
        </span>
      </div>
      {status === "rejected" && doc?.note && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-strong">{doc.note}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {canUpload && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setError("");
              if (file) upload.mutate(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={upload.isPending}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-strong text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => input.current?.click()}
          >
            <Camera size={17} /> {upload.isPending ? "Subiendo" : status === "rejected" ? "Subir de nuevo" : "Tomar o subir foto"}
          </button>
        </>
      )}
    </li>
  );
}
