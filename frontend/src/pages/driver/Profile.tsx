import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock3, CreditCard, FileCheck2, LogOut, Star, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EditableName } from "../../components/EditableName.tsx";
import { MapStylePicker } from "../../components/MapStylePicker.tsx";
import { Shell } from "../../components/Shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import { LinkRow, SectionTitle } from "../../components/ui/list.tsx";
import { api } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { initials } from "../../lib/format.ts";

type Me = { name: string; rating: number; verification_status: string; completed_rides: number; cancelled_rides: number };

export function DriverProfile() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["driver"], queryFn: () => api<Me>("/api/v1/drivers/me") });
  const data = me.data;
  const verified = data?.verification_status === "approved";

  return (
    <Shell>
      <div className="flex flex-1 flex-col bg-white px-4 py-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">Perfil</h1>

        <section className="mt-5 flex flex-col items-center rounded-3xl bg-foam px-4 pb-5 pt-6 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-foam text-2xl font-extrabold text-ink ring-4 ring-white">
            {data ? initials(data.name) : ""}
          </span>
          <EditableName name={data?.name} endpoint="/api/v1/drivers/me" queryKey={["driver"]} />
          {data && (
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                verified ? "bg-ok-soft text-ok-strong" : "bg-[#fef3c7] text-warn"
              }`}
            >
              {verified ? <BadgeCheck size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
              {verified ? "Conductor verificado" : "Verificación en revisión"}
            </span>
          )}

          <dl className="mt-5 grid w-full grid-cols-3 divide-x divide-line rounded-2xl bg-white py-3">
            <div className="flex flex-col-reverse items-center">
              <dt className="text-xs text-muted">Calificación</dt>
              <dd className="inline-flex items-center gap-1 text-2xl font-extrabold">
                {data ? data.rating.toFixed(1) : "—"}
                {data && <Star size={16} className="text-star" fill="currentColor" aria-hidden="true" />}
              </dd>
            </div>
            <div className="flex flex-col-reverse items-center">
              <dt className="text-xs text-muted">Completados</dt>
              <dd className="text-2xl font-extrabold">{data?.completed_rides ?? "—"}</dd>
            </div>
            <div className="flex flex-col-reverse items-center">
              <dt className="text-xs text-muted">Cancelados</dt>
              <dd className="text-2xl font-extrabold">{data?.cancelled_rides ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <SectionTitle>Cuenta</SectionTitle>
        <ul className="rounded-2xl border border-line">
          <LinkRow to="/conductor/documentos" icon={<FileCheck2 size={18} />} label="Documentos" detail="Identificación, licencia y vehículo" />
          <LinkRow to="/conductor/membresia" icon={<CreditCard size={18} />} label="Tu membresía" detail="Plan y comprobantes de pago" />
          <LinkRow to="/conductor/referidos" icon={<Users size={18} />} label="Referidos" detail="Gana días de membresía invitando" />
        </ul>

        <MapStylePicker />

        <Button className="mt-auto" variant="danger" onClick={() => logout().then(() => navigate("/"))}>
          <LogOut size={18} aria-hidden="true" /> Cerrar sesión
        </Button>
      </div>
    </Shell>
  );
}
