import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { when } from "../../lib/format.ts";
import { Badge, Drawer, Empty, Field, Filters, Page, Panel } from "./ui.tsx";

type Account = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: "passenger" | "driver" | "admin";
  status: string;
  rides: number;
  created_at: string | null;
};

type Filter = "all" | "passenger" | "driver" | "admin" | "suspended" | "deleted";

const ROLE: Record<Account["role"], string> = { passenger: "Pasajero", driver: "Conductor", admin: "Administrador" };

/** Etiqueta del estado de una cuenta, distinta de la de una membresía. */
export function AccountBadge({ status }: { status: string }) {
  return <Badge status={status} label={status === "active" ? "Activa" : status === "suspended" ? "Suspendida" : undefined} />;
}

export function Accounts() {
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<Account | null>(null);
  const accounts = useQuery({ queryKey: ["admin-accounts"], queryFn: () => api<Account[]>("/api/v1/admin/accounts") });
  const all = accounts.data ?? [];
  const matches = (row: Account, key: Filter) =>
    key === "all" ? row.status !== "deleted" : key === "suspended" || key === "deleted" ? row.status === key : row.role === key && row.status !== "deleted";
  const needle = term.trim().toLowerCase();
  const rows = all.filter(
    (row) => matches(row, filter) && (!needle || [row.name, row.phone, row.email].some((value) => value?.toLowerCase().includes(needle))),
  );
  const count = (key: Filter) => all.filter((row) => matches(row, key)).length;

  return (
    <Page title="Cuentas" description="Busca cualquier cuenta, suspéndela o elimina sus datos personales cuando la persona lo pida.">
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: "Todas", count: count("all") },
          { id: "passenger", label: "Pasajeros", count: count("passenger") },
          { id: "driver", label: "Conductores", count: count("driver") },
          { id: "admin", label: "Administradores", count: count("admin") },
          { id: "suspended", label: "Suspendidas", count: count("suspended") },
          { id: "deleted", label: "Eliminadas", count: count("deleted") },
        ]}
      />
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
        <Search size={16} className="text-muted" aria-hidden="true" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar por nombre, teléfono o correo"
          aria-label="Buscar cuenta"
          className="h-11 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <Panel className="mt-4 overflow-hidden">
        {rows.length === 0 && accounts.isSuccess && <Empty title="No hay cuentas en esta lista" />}
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="border-b border-line last:border-0">
              <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-foam/60 md:px-5" onClick={() => setOpen(row)}>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{row.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {ROLE[row.role]} · {[row.phone, row.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </span>
                </span>
                <AccountBadge status={row.status} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {open && (
        <Drawer title={open.name} onClose={() => setOpen(null)}>
          <Field label="Tipo">{ROLE[open.role]}</Field>
          <Field label="Teléfono">{open.phone ?? "—"}</Field>
          <Field label="Correo">{open.email ?? "—"}</Field>
          <Field label="Viajes">{open.rides}</Field>
          <Field label="Alta">{when(open.created_at)}</Field>
          {open.role !== "admin" && <AccountActions userId={open.id} status={open.status} onDone={(status) => setOpen({ ...open, status })} />}
        </Drawer>
      )}
    </Page>
  );
}

/** Suspender, reactivar o eliminar los datos de una cuenta; eliminar pide confirmación. */
export function AccountActions({ userId, status, onDone }: { userId: string; status: string; onDone?: (status: string) => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const act = useMutation({
    mutationFn: (action: "suspend" | "activate" | "delete") =>
      action === "delete"
        ? api<{ status: string }>(`/api/v1/admin/accounts/${userId}`, { method: "DELETE" })
        : api<{ status: string }>(`/api/v1/admin/accounts/${userId}/${action}`, { method: "POST" }),
    onSuccess: (result) => {
      setConfirm(false);
      onDone?.(result.status);
      for (const key of ["admin-accounts", "admin-passengers", "admin-passenger", "admin-drivers"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  if (status === "deleted") {
    return <p className="mt-6 rounded-xl bg-foam px-4 py-3 text-sm text-muted">Los datos personales de esta cuenta ya se eliminaron.</p>;
  }
  return (
    <section className="mt-6 space-y-3">
      <h3 className="font-bold">Cuenta</h3>
      {status === "suspended" ? (
        <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("activate")}>Reactivar cuenta</Button>
      ) : (
        <Button size="sm" variant="line" disabled={act.isPending} onClick={() => act.mutate("suspend")}>Suspender cuenta</Button>
      )}
      {!confirm && (
        <Button size="sm" variant="danger" disabled={act.isPending} onClick={() => setConfirm(true)}>Eliminar datos de la cuenta</Button>
      )}
      {confirm && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <p className="font-semibold text-danger-strong">Esto no se puede deshacer.</p>
          <p className="mt-1 text-ink">
            Se borran el nombre, teléfono, correo, foto, lugares guardados, documentos y avisos, y se cierra su sesión. Los viajes y pagos se conservan sin datos personales.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" variant="line" disabled={act.isPending} onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button size="sm" variant="danger" disabled={act.isPending} onClick={() => act.mutate("delete")}>Sí, eliminar</Button>
          </div>
        </div>
      )}
      {act.error && <p className="text-sm text-danger">{(act.error as Error).message}</p>}
    </section>
  );
}
