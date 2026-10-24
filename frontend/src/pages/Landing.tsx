import { Car, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";

const demos = [
  {
    title: "Iniciar como pasajero",
    identifier: "maria@ruta.local",
    password: "Pasajero1234",
    to: "/pasajero",
    icon: UserRound,
    primary: true,
  },
  {
    title: "Iniciar como conductor",
    identifier: "ana@ruta.local",
    password: "Conductor1234",
    to: "/conductor",
    icon: Car,
    primary: false,
  },
] as const;

const promises = [
  "Ves el precio antes de pedir",
  "Pagas directo a tu conductor",
  "Conductores sin comisión por viaje",
];

export function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function enter(identifier: string, password: string, to: string) {
    setError("");
    setPending(identifier);
    try {
      await login(identifier, password);
      navigate(to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-surface">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-6 pb-6 pt-5 md:grid md:grid-cols-[1fr_1.1fr] md:items-center md:gap-12 md:px-10">
        <div className="flex min-h-0 flex-1 flex-col md:order-2 md:flex-none">
          <header className="flex items-center gap-2.5 md:hidden">
            <Logo />
          </header>
          <RouteScene />
        </div>

        <div className="mt-5 flex flex-col md:order-1 md:mt-0">
          <header className="mb-10 hidden items-center gap-2.5 md:flex">
            <Logo />
          </header>
          <h1 className="max-w-[15ch] text-[2.5rem] font-extrabold [@media(max-height:700px)]:text-[2rem] leading-[1.05] tracking-tight text-ink md:text-6xl">
            Viajes directos, sin intermediarios.
          </h1>
          <ul className="mt-4 space-y-2 text-[15px] text-muted md:text-base">
            {promises.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-strong" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <div className="space-y-3 pt-6 md:mt-10 md:max-w-sm">
            {demos.map((demo) => (
              <button
                key={demo.identifier}
                type="button"
                disabled={pending !== null}
                onClick={() => enter(demo.identifier, demo.password, demo.to)}
                className={`flex h-13 w-full items-center justify-center gap-2 rounded-full text-base font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                  demo.primary ? "bg-brand-strong text-white" : "border border-line bg-surface text-ink"
                }`}
              >
                <demo.icon size={18} aria-hidden="true" />
                {pending === demo.identifier ? "Entrando" : demo.title}
              </button>
            ))}
            {error && (
              <p className="text-center text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <p className="pt-1 text-center text-sm text-muted">
              ¿Ya tienes cuenta?{" "}
              <Link to="/entrar" className="font-semibold text-ink underline">
                Iniciar sesión
              </Link>
              {" · "}
              <Link to="/registro" className="font-semibold text-ink underline">
                Crear cuenta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-strong">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" fill="white" />
          <circle cx="12" cy="10" r="2.3" fill="#0B6E7F" />
        </svg>
      </span>
      <span className="text-xl font-extrabold tracking-tight text-ink">Ruta</span>
    </>
  );
}

/** Ruta por calles genéricas: el auto recorre el trayecto hasta el punto de recogida. */
const ROUTE = "M58 286 L58 214 Q58 196 76 196 L196 196 Q214 196 214 178 L214 112 Q214 94 232 94 L302 94";
/** El auto se detiene al final de la ruta, justo antes del pin de recogida. */
const ROUTE_END = "translate(302 94)";

function RouteScene() {
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Manzanas de una ciudad cualquiera: rectángulos irregulares separados por calles.
  const blocks = [
    [20, 20, 70, 58], [104, 20, 92, 58], [210, 20, 58, 58], [282, 20, 98, 58],
    [20, 92, 70, 88], [104, 92, 92, 88], [228, 110, 152, 70],
    [74, 212, 122, 70], [228, 194, 70, 88], [312, 194, 68, 88],
    [20, 296, 120, 44], [154, 296, 70, 44], [238, 296, 142, 44],
  ];
  return (
    <div className="relative mt-4 min-h-0 w-full flex-1 overflow-hidden rounded-[28px] bg-foam md:mt-0 md:aspect-[400/360] md:max-h-[85dvh] md:flex-none">
      <svg viewBox="0 0 400 360" className="h-full w-full" role="img" aria-label="Un auto recorre la ruta hasta el punto de recogida">
        {blocks.map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="10" fill="var(--color-surface)" />
        ))}
        <path d={ROUTE} fill="none" stroke="var(--color-surface)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={ROUTE}
          pathLength={1}
          fill="none"
          stroke="#0B6E7F"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ruta-route-draw"
        />
        <g transform="translate(340 94)">
          <circle r="22" fill="#0B6E7F" opacity="0.14" />
          <path d="M0 6s11-11.3 11-18.9a11 11 0 1 0-22 0C-11-5.3 0 6 0 6z" transform="translate(0 -4)" fill="#0B6E7F" stroke="#fff" strokeWidth="2.5" />
          <circle cy="-16" r="4" fill="#fff" />
        </g>
        <g transform={still ? ROUTE_END : undefined}>
          {!still && <animateMotion dur="2.6s" begin="0s" fill="freeze" path={ROUTE} calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1" />}
          <circle r="17" fill="#15803d" stroke="#fff" strokeWidth="3" />
          <g transform="translate(-9 -9) scale(0.75)" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" />
            <path d="M9 17h6" />
            <circle cx="17" cy="17" r="2" />
          </g>
        </g>
      </svg>
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
        <span>
          <span className="block text-xs text-muted">Tu conductor llega en</span>
          <span className="block text-lg font-extrabold text-ink">4 min</span>
        </span>
        <span className="text-right">
          <span className="block text-xs text-muted">Precio acordado</span>
          <span className="block text-lg font-extrabold text-ink">$62</span>
        </span>
      </div>
    </div>
  );
}
