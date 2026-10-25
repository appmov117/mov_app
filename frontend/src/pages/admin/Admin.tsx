import { useQuery } from "@tanstack/react-query";
import {
  Car,
  FileCheck2,
  Hexagon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Motorbike,
  Radio,
  Route,
  ShieldAlert,
  Star,
  Tags,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { enablePush } from "../../lib/push.ts";
import { Broadcasts } from "./Broadcasts.tsx";
import { Complaints } from "./Complaints.tsx";
import { Documents } from "./Documents.tsx";
import { Drivers } from "./Drivers.tsx";
import { Feedback } from "./Feedback.tsx";
import { Heatmap } from "./Heatmap.tsx";
import { Live } from "./Live.tsx";
import { Memberships } from "./Memberships.tsx";
import { Motos } from "./Motos.tsx";
import { Overview } from "./Overview.tsx";
import { Rides } from "./Rides.tsx";
import { Safety, type Alert } from "./Safety.tsx";
import { Tariffs } from "./Tariffs.tsx";

type Counts = { documents: number; payments: number; complaints: number };
type Section = { id: string; label: string; icon: LucideIcon; badge?: keyof Counts | "alerts" };

const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: "Operación",
    items: [
      { id: "vivo", label: "En vivo", icon: Radio },
      { id: "resumen", label: "Resumen", icon: LayoutDashboard },
      { id: "viajes", label: "Viajes", icon: Route },
      { id: "calor", label: "Mapa de calor", icon: Hexagon },
      { id: "tarifas", label: "Tarifas", icon: Tags },
    ],
  },
  {
    title: "Conductores",
    items: [
      { id: "conductores", label: "Conductores", icon: Car },
      { id: "motos", label: "Motos", icon: Motorbike },
      { id: "documentos", label: "Documentos", icon: FileCheck2, badge: "documents" },
      { id: "membresias", label: "Membresías y pagos", icon: Wallet, badge: "payments" },
    ],
  },
  {
    title: "Atención",
    items: [
      { id: "quejas", label: "Quejas", icon: MessageSquareWarning, badge: "complaints" },
      { id: "opiniones", label: "Opiniones", icon: Star },
      { id: "avisos", label: "Avisos", icon: Megaphone },
      { id: "seguridad", label: "Seguridad", icon: ShieldAlert, badge: "alerts" },
    ],
  },
];
const FULL = new Set(["vivo", "calor"]);

export function AdminHome() {
  const { section = "vivo" } = useParams();
  const alerts = useQuery({ queryKey: ["admin-alerts"], queryFn: () => api<Alert[]>("/api/v1/admin/safety/alerts"), refetchInterval: 10_000 });
  const counts = useQuery({
    queryKey: ["admin-counts"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Counts> => {
      const [documents, payments, complaints] = await Promise.all([
        api<unknown[]>("/api/v1/admin/documents?status=pending"),
        api<{ status: string }[]>("/api/v1/admin/payments"),
        api<unknown[]>("/api/v1/admin/complaints?status=open"),
      ]);
      return { documents: documents.length, payments: payments.filter((row) => row.status === "pending").length, complaints: complaints.length };
    },
  });
  const openAlerts = (alerts.data ?? []).filter((alert) => alert.status === "open").length;
  const badge = (key: Section["badge"]) => (key === "alerts" ? openAlerts : key ? counts.data?.[key] ?? 0 : 0);

  return (
    <div className="flex h-dvh bg-foam">
      <Sidebar badge={badge} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar section={section} badge={badge} />
        {openAlerts > 0 && section !== "seguridad" && (
          <Link to="/admin/seguridad" className="flex items-center gap-3 bg-danger px-6 py-2.5 text-sm font-semibold text-white">
            <ShieldAlert size={18} aria-hidden="true" />
            {openAlerts === 1 ? "Hay 1 alerta de pánico abierta." : `Hay ${openAlerts} alertas de pánico abiertas.`} Atender ahora
          </Link>
        )}
        <main className={`min-h-0 flex-1 ${FULL.has(section) ? "overflow-hidden" : "overflow-y-auto"}`}>
          <SectionView section={section} alerts={alerts.data ?? []} />
        </main>
      </div>
    </div>
  );
}

function SectionView({ section, alerts }: { section: string; alerts: Alert[] }): ReactNode {
  switch (section) {
    case "resumen": return <Overview />;
    case "viajes": return <Rides />;
    case "calor": return <Heatmap />;
    case "tarifas": return <Tariffs />;
    case "conductores": return <Drivers />;
    case "motos": return <Motos />;
    case "documentos": return <Documents />;
    case "membresias": return <Memberships />;
    case "quejas": return <Complaints />;
    case "opiniones": return <Feedback />;
    case "avisos": return <Broadcasts />;
    case "seguridad": return <Safety alerts={alerts} />;
    default: return <Live />;
  }
}

function Sidebar({ badge }: { badge: (key: Section["badge"]) => number }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <SidebarContent badge={badge} />
    </aside>
  );
}

function SidebarContent({ badge }: { badge: (key: Section["badge"]) => number }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" fill="white" />
            <circle cx="12" cy="10" r="2.3" fill="#0B6E7F" />
          </svg>
        </span>
        <span>
          <span className="block text-lg font-extrabold leading-none">Ruta</span>
          <span className="text-xs text-muted">Panel de operación</span>
        </span>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => (
          <div key={group.title} className="mt-4">
            <p className="px-3 pb-1.5 text-xs font-semibold text-muted">{group.title}</p>
            {group.items.map((item) => <NavItem key={item.id} item={item} count={badge(item.badge)} />)}
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-line px-4 py-4">
        <PushToggle />
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{user?.name}</span>
          <button
            type="button"
            aria-label="Cerrar sesión"
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-foam hover:text-ink"
            onClick={() => void logout().then(() => navigate("/"))}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </>
  );
}

function NavItem({ item, count }: { item: Section; count: number }) {
  const urgent = item.badge === "alerts";
  const { pathname } = useLocation();
  return (
    <NavLink
      to={`/admin/${item.id}`}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition lg:py-2 ${
          isActive || (item.id === "vivo" && pathname === "/admin") ? "bg-foam text-ink" : "text-muted hover:bg-foam hover:text-ink"
        }`
      }
    >
      <item.icon size={18} aria-hidden="true" />
      <span className="flex-1 whitespace-nowrap">{item.label}</span>
      {count > 0 && (
        <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${urgent ? "bg-danger text-white" : "bg-warn-soft text-warn"}`}>
          {count}
        </span>
      )}
    </NavLink>
  );
}

/** En el celular: barra con la sección actual y un menú que se abre de lado con todas las secciones. */
function MobileBar({ section, badge }: { section: string; badge: (key: Section["badge"]) => number }) {
  const [open, setOpen] = useState(false);
  const items = GROUPS.flatMap((group) => group.items);
  const current = items.find((item) => item.id === section) ?? items[0];
  const pending = items.reduce((total, item) => total + badge(item.badge), 0);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 lg:hidden">
        <button type="button" aria-label="Abrir menú" aria-expanded={open} className="relative grid h-11 w-11 place-items-center rounded-full" onClick={() => setOpen(true)}>
          <Menu size={22} />
          {pending > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-danger" aria-hidden="true" />}
        </button>
        <current.icon size={18} className="text-ink" aria-hidden="true" />
        <span className="font-extrabold">{current.label}</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 flex bg-night/30 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú del panel" onClick={() => setOpen(false)}>
          <aside className="ruta-from-left relative flex h-full w-[84%] max-w-xs flex-col bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Cerrar menú" className="absolute right-3 top-4 grid h-10 w-10 place-items-center rounded-full bg-foam" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
            <SidebarContent badge={badge} />
          </aside>
        </div>
      )}
    </>
  );
}

function PushToggle() {
  const [state, setState] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  if (state === "granted") return <p className="text-xs text-muted">Alertas de pánico activadas en este equipo.</p>;
  return (
    <button
      type="button"
      disabled={state === "denied"}
      className="w-full rounded-xl border border-line px-3 py-2 text-left text-sm font-semibold disabled:text-muted"
      onClick={() => void enablePush().then((ok) => setState(ok ? "granted" : Notification.permission))}
    >
      {state === "denied" ? "Notificaciones bloqueadas en el navegador" : "Activar alertas de pánico"}
    </button>
  );
}
