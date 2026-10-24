import { Car, Clock, Home, MessageCircle, User, Wallet } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth.tsx";
import { DriverBeacon } from "./DriverBeacon.tsx";

const driverLinks = [
  { to: "/conductor", label: "Inicio", icon: Home, end: true },
  { to: "/conductor/viajes", label: "Viajes", icon: Car, end: false },
  { to: "/conductor/ganancias", label: "Ganancias", icon: Wallet, end: false },
  { to: "/conductor/perfil", label: "Perfil", icon: User, end: false },
];

const passengerLinks = [
  { to: "/pasajero", label: "Inicio", icon: Home, end: true },
  { to: "/pasajero/historial", label: "Viajes", icon: Clock, end: false },
  { to: "/pasajero/mensajes", label: "Mensajes", icon: MessageCircle, end: false },
  { to: "/pasajero/perfil", label: "Perfil", icon: User, end: false },
];

type Props = {
  children: ReactNode;
  nav?: boolean;
  scroll?: boolean;
  /** Pantallas de mapa: ocupan todo el ancho en tablet y escritorio en lugar de una columna centrada. */
  full?: boolean;
};

export function Shell({ children, nav = true, scroll = true, full = false }: Props) {
  const { user } = useAuth();
  const passenger = user?.role === "passenger";
  const driver = user?.role === "driver";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface md:flex-row">
      <main className={`relative flex min-h-0 flex-1 flex-col ${scroll ? "overflow-y-auto" : "overflow-hidden"}`}>
        {full ? children : <div className="flex min-h-0 flex-1 flex-col md:mx-auto md:w-full md:max-w-2xl">{children}</div>}
      </main>
      {nav && passenger && <TabBar items={passengerLinks} />}
      {nav && driver && <TabBar items={driverLinks} />}
      {driver && <DriverBeacon />}
    </div>
  );
}

function TabBar({ items }: { items: { to: string; label: string; icon: typeof Home; end: boolean }[] }) {
  return (
    <nav className="sticky bottom-0 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:static md:order-first md:flex md:w-24 md:shrink-0 md:flex-col md:items-stretch md:gap-1 md:border-r md:border-t-0 md:px-2 md:py-5">
      <span className="mb-5 hidden items-center justify-center md:flex" aria-hidden="true">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-brand shadow">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" fill="white" />
            <circle cx="12" cy="10" r="2.3" fill="#0B6E7F" />
          </svg>
        </span>
      </span>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold md:rounded-2xl md:py-3 ${isActive ? "text-ink md:bg-foam" : "text-muted"}`
          }
        >
          <item.icon size={20} strokeWidth={2.2} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
