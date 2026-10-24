import { useQuery } from "@tanstack/react-query";
import { Clock, LogOut, Mail, MessageCircle, Phone, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { EditableName } from "../../components/EditableName.tsx";
import { MapStylePicker } from "../../components/MapStylePicker.tsx";
import { Shell } from "../../components/Shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import { LinkRow, SectionTitle } from "../../components/ui/list.tsx";
import { api } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { initials } from "../../lib/format.ts";

type Profile = { name: string; phone: string; email: string | null; total_rides: number; places: unknown[] };

export function PassengerProfile() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ["passenger"], queryFn: () => api<Profile>("/api/v1/passengers/me") });
  const data = profile.data;

  return (
    <Shell>
      <div className="flex flex-1 flex-col bg-white px-4 py-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">Perfil</h1>

        <section className="mt-5 flex flex-col items-center rounded-3xl bg-foam px-4 pb-5 pt-6 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-foam text-2xl font-extrabold text-ink ring-4 ring-white">
            {data ? initials(data.name) : ""}
          </span>
          <EditableName name={data?.name} endpoint="/api/v1/passengers/me" queryKey={["passenger"]} />
          <span className="mt-2 rounded-full bg-foam px-3 py-1 text-xs font-bold text-muted">Pasajero</span>

          <dl className="mt-5 grid w-full grid-cols-2 divide-x divide-line rounded-2xl bg-white py-3">
            <Stat label="Viajes" value={data?.total_rides} />
            <Stat label="Lugares guardados" value={data?.places.length} />
          </dl>
        </section>

        <SectionTitle>Cuenta</SectionTitle>
        <ul className="rounded-2xl border border-line">
          <Row icon={<Phone size={18} />} label="Teléfono" value={data ? formatPhone(data.phone) : "—"} />
          <Row icon={<Mail size={18} />} label="Correo" value={data?.email ?? "Sin correo"} muted={!data?.email} />
        </ul>

        <SectionTitle>Actividad</SectionTitle>
        <ul className="rounded-2xl border border-line">
          <LinkRow to="/pasajero/historial" icon={<Clock size={18} />} label="Mis viajes" />
          <LinkRow to="/pasajero/mensajes" icon={<MessageCircle size={18} />} label="Mensajes" />
        </ul>

        <MapStylePicker />

        <div className="mt-5 flex gap-3 rounded-2xl bg-foam p-4">
          <Wallet size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink/70">
            El pago del viaje se hace directo al conductor, en efectivo o en su terminal.
          </p>
        </div>

        <Button className="mt-auto" variant="danger" onClick={() => logout().then(() => navigate("/"))}>
          <LogOut size={18} aria-hidden="true" /> Cerrar sesión
        </Button>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col-reverse items-center">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-2xl font-extrabold">{value ?? "—"}</dd>
    </div>
  );
}

function Row({ icon, label, value, muted = false }: { icon: ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
      <span className="text-muted" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className={`block truncate text-sm font-semibold ${muted ? "text-muted" : ""}`}>{value}</span>
      </span>
    </li>
  );
}

function formatPhone(phone: string) {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}
