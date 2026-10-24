import { LoaderCircle } from "lucide-react";

/** Indicador de carga centrado; ocupa el espacio disponible del contenedor. */
export function Loading({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted" role="status">
      <LoaderCircle size={28} className="animate-spin text-muted" aria-hidden="true" />
      {label}
    </div>
  );
}
