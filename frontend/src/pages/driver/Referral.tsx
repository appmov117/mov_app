import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, Copy, QrCode, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";

type Referral = {
  code: string;
  url: string;
  active_passengers: number;
  month_passengers: number;
  reward_days: number;
  monthly_cap_days: number;
};

/** Metas mensuales de pasajeros invitados y los días gratis que dan. */
const GOALS = [
  { passengers: 3, days: 7 },
  { passengers: 10, days: 30 },
];

export function DriverReferral() {
  const referral = useQuery({ queryKey: ["referral"], queryFn: () => api<Referral>("/api/v1/drivers/me/referral") });
  const [qr, setQr] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const data = referral.data;

  useEffect(() => {
    if (!data || !showQr) return;
    void QRCode.toDataURL(data.url, { margin: 1, width: 360 }).then(setQr);
  }, [data, showQr]);

  async function share() {
    if (!data) return;
    const text = `Viaja con Ruta: ves el precio antes y pagas directo al conductor. Regístrate con mi código ${data.code}: ${data.url}`;
    if (navigator.share) {
      await navigator.share({ title: "Ruta", text }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noreferrer");
  }

  async function copy() {
    if (!data) return;
    await navigator.clipboard?.writeText(data.url).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const month = data?.month_passengers ?? 0;
  const next = GOALS.find((goal) => month < goal.passengers);

  return (
    <Shell>
      <div className="px-4 py-5">
        <Link to="/conductor/perfil" className="-ml-2 inline-grid h-10 w-10 place-items-center rounded-full" aria-label="Volver al perfil">
          <ChevronLeft size={24} />
        </Link>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">Referidos</h1>
        <p className="mt-1 text-sm text-muted">Invita pasajeros y conductores y gana días gratis de membresía.</p>

        <section className="mt-5 rounded-2xl border border-line p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold">Este mes</h2>
            <span className="text-sm text-muted">{data ? `${data.reward_days} días ganados en total` : ""}</span>
          </div>
          <p className="mt-2 text-sm">
            <span className="text-2xl font-extrabold tabular-nums">{month}</span>{" "}
            {month === 1 ? "pasajero invitado hizo" : "pasajeros invitados hicieron"} su primer viaje
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-foam" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-strong" style={{ width: `${Math.min(100, (month / 10) * 100)}%` }} />
          </div>
          <ol className="mt-2 flex justify-between text-xs text-muted">
            {GOALS.map((goal) => (
              <li key={goal.passengers} className={month >= goal.passengers ? "font-bold text-ok-strong" : ""}>
                {month >= goal.passengers && <Check size={12} className="mr-0.5 inline" aria-hidden="true" />}
                {goal.passengers} pasajeros: {goal.days} días
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted">
            {next ? `Te faltan ${next.passengers - month} para ganar ${next.days} días.` : "Ya ganaste las dos recompensas de este mes."}
          </p>
        </section>

        <section className="mt-4 rounded-2xl bg-foam p-4">
          <p className="text-sm text-muted">Tu código</p>
          <p className="mt-1 text-3xl font-extrabold tracking-[0.12em]">{data?.code ?? "—"}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={!data} className="flex h-11 items-center justify-center gap-2 rounded-full bg-brand-strong text-sm font-semibold text-white disabled:opacity-50" onClick={() => void share()}>
              <Share2 size={16} aria-hidden="true" /> Compartir
            </button>
            <button type="button" disabled={!data} className="flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-white text-sm font-semibold disabled:opacity-50" onClick={() => void copy()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? "Enlace copiado" : "Copiar enlace"}
            </button>
          </div>
          <button type="button" aria-expanded={showQr} className="mt-3 flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold" onClick={() => setShowQr((value) => !value)}>
            <QrCode size={16} aria-hidden="true" /> {showQr ? "Ocultar código QR" : "Mostrar código QR para escanear"}
          </button>
          {showQr && qr && <img src={qr} alt={`Código QR para registrarse con ${data?.code}`} className="mx-auto mt-2 w-44 rounded-xl bg-white p-2" />}
        </section>

        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Cómo se gana</h2>
          <ul className="overflow-hidden rounded-2xl border border-line text-sm">
            <Rule label="3 pasajeros con su primer viaje en el mes" value="7 días" />
            <Rule label="10 pasajeros con su primer viaje en el mes" value="30 días" />
            <Rule label="Un conductor invitado paga su membresía" value="15 días" />
            <Rule label="Máximo por mes" value={`${data?.monthly_cap_days ?? 45} días`} />
          </ul>
        </section>
      </div>
    </Shell>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
      <span>{label}</span>
      <span className="shrink-0 font-bold">{value}</span>
    </li>
  );
}
