import { useMutation } from "@tanstack/react-query";
import { BellRing, Mic, Phone, Share2, Square, Video, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Pin } from "./MapView.tsx";
import { Button } from "./ui/button.tsx";
import { api } from "../lib/api.ts";
import type { RecordingKind, SafetyRecorder } from "../lib/useSafetyRecorder.ts";

export type SafetyRide = {
  id: string;
  destination_label: string | null;
  driver: {
    name: string;
    vehicle: { brand: string; model: string; color: string | null; plate: string } | null;
  } | null;
};

type Props = { ride: SafetyRide; position: Pin | null; recorder: SafetyRecorder; onClose: () => void };

/** Comparte los datos del viaje con un contacto; usa WhatsApp si el navegador no tiene menú de compartir. */
export async function shareTrip(ride: SafetyRide | null, position: Pin | null, destination?: string | null) {
  const vehicle = ride?.driver?.vehicle;
  const lines = [
    "Voy en un viaje de Ruta.",
    ride?.driver ? `Conductor: ${ride.driver.name}` : null,
    vehicle ? `Vehículo: ${[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(" ")}, placa ${vehicle.plate}` : null,
    `Destino: ${(ride?.destination_label ?? destination ?? "mi destino").split(" · ")[0]}`,
    position ? `Ubicación: https://maps.google.com/?q=${position.latitude},${position.longitude}` : null,
  ];
  const text = lines.filter(Boolean).join("\n");
  if (navigator.share) {
    await navigator.share({ title: "Mi viaje en Ruta", text }).catch(() => undefined);
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

function currentPosition(): Promise<Pin | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (result) => resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 3000, maximumAge: 15_000 },
    );
  });
}

export function SafetySheet({ ride, position, recorder, onClose }: Props) {
  const [confirmCall, setConfirmCall] = useState(false);
  const alert = useMutation({
    mutationFn: (pin: Pin | null) =>
      api(`/api/v1/rides/${ride.id}/safety/alerts`, {
        method: "POST",
        body: JSON.stringify(pin ?? {}),
        keepalive: true,
      }),
  });

  function call911() {
    // La alerta sale sin esperar al GPS; el servidor usa la ubicación del conductor como respaldo.
    alert.mutate(null);
    window.location.href = "tel:911";
  }

  async function notifyRuta() {
    alert.mutate(await currentPosition());
  }

  function toggle(kind: RecordingKind) {
    if (recorder.kind === kind) recorder.stop();
    else if (!recorder.kind) void recorder.start(kind);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="safety-title" onClick={onClose}>
      <section
        className="ruta-sheet w-full max-w-[430px] rounded-t-[28px] md:rounded-[28px] bg-white px-5 pb-6 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between">
          <h2 id="safety-title" className="text-xl font-extrabold">Seguridad</h2>
          <button type="button" aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-foam" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {confirmCall ? (
          <div className="mt-4 rounded-2xl bg-danger-soft p-4">
            <p className="font-bold text-danger">¿Llamar al 911?</p>
            <p className="mt-1 text-sm text-ink/70">También avisaremos a Ruta con la ubicación del viaje.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="line" size="sm" onClick={() => setConfirmCall(false)}>Cancelar</Button>
              <Button size="sm" className="bg-danger" onClick={call911}>
                <Phone size={16} aria-hidden="true" /> Llamar
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-danger py-4 text-lg font-extrabold text-white"
            onClick={() => setConfirmCall(true)}
          >
            <Phone size={20} aria-hidden="true" /> Llamar al 911
          </button>
        )}

        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          <Action
            icon={<BellRing size={20} />}
            title="Avisar a Ruta"
            detail={alert.isSuccess ? "Alerta enviada. El equipo de Ruta ya la recibió." : alert.error ? (alert.error as Error).message : "Enviamos tu ubicación al equipo de soporte"}
            tone={alert.isSuccess ? "text-ok-strong" : alert.error ? "text-danger" : undefined}
            action={
              <Button size="sm" variant="line" className="w-auto" disabled={alert.isPending || alert.isSuccess} onClick={() => void notifyRuta()}>
                {alert.isPending ? "Enviando" : alert.isSuccess ? "Enviada" : "Avisar"}
              </Button>
            }
          />
          <Action
            icon={<Mic size={20} />}
            title="Grabar audio"
            detail={recorder.kind === "audio" ? `Grabando · ${elapsed(recorder.seconds)}` : "Se guarda de forma privada para soporte"}
            tone={recorder.kind === "audio" ? "text-danger" : undefined}
            action={<RecordButton active={recorder.kind === "audio"} disabled={recorder.kind === "video"} onClick={() => toggle("audio")} />}
          />
          <Action
            icon={<Video size={20} />}
            title="Grabar video"
            detail={recorder.kind === "video" ? `Grabando · ${elapsed(recorder.seconds)}` : "Usa la cámara trasera"}
            tone={recorder.kind === "video" ? "text-danger" : undefined}
            action={<RecordButton active={recorder.kind === "video"} disabled={recorder.kind === "audio"} onClick={() => toggle("video")} />}
          />
          <Action
            icon={<Share2 size={20} />}
            title="Compartir viaje"
            detail="Conductor, placa, destino y ubicación"
            action={
              <Button size="sm" variant="line" className="w-auto" onClick={() => void shareTrip(ride, position)}>
                Compartir
              </Button>
            }
          />
        </ul>

        {recorder.kind === "video" && recorder.stream && <Preview stream={recorder.stream} />}
        {recorder.error && <p className="mt-3 text-sm text-danger">{recorder.error}</p>}
        {recorder.uploading > 0 && <p className="mt-3 text-xs text-muted">Subiendo grabación…</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Las grabaciones solo las ve el equipo de Ruta si hay un reporte. Se suben cada minuto mientras grabas.
        </p>
      </section>
    </div>
  );
}

function Action({ icon, title, detail, tone, action }: { icon: ReactNode; title: string; detail: string; tone?: string; action: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="shrink-0 text-ink/70" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={`block text-xs ${tone ?? "text-muted"}`} aria-live="polite">{detail}</span>
      </span>
      {action}
    </li>
  );
}

function RecordButton({ active, disabled, onClick }: { active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant={active ? "danger" : "line"} className="w-auto" disabled={disabled} onClick={onClick}>
      {active ? <><Square size={14} fill="currentColor" aria-hidden="true" /> Detener</> : "Grabar"}
    </Button>
  );
}

function Preview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className="mt-3 h-32 w-full rounded-2xl bg-ink object-cover" autoPlay muted playsInline />;
}

export function elapsed(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
