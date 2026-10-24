import { BellRing, MapPinOff } from "lucide-react";
import { useState } from "react";
import { locateOnce, useLocationProblem } from "../lib/position.ts";
import { prepareAlerts } from "./DriverBeacon.tsx";

const LOCATION_TEXT = {
  denied: "El navegador no tiene permiso de ubicación. Sin ella no recibes viajes ni ves tu auto en el mapa. Permítela en el candado junto a la dirección y, en Mac, en Ajustes del Sistema → Privacidad → Localización.",
  unavailable: "No llega la señal de ubicación. Sin ella no recibes viajes. Revisa que la ubicación del dispositivo esté encendida.",
  unsupported: "Este navegador no comparte la ubicación. Usa Chrome o Safari actualizados para recibir viajes.",
} as const;

/** Explica por qué falta la ubicación del conductor, con un botón para volver a intentar. */
/** `compact`: una línea, para mapas de navegación donde el espacio es poco. */
export function LocationNotice({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const problem = useLocationProblem();
  const [trying, setTrying] = useState(false);
  if (!problem) return null;
  return (
    <div className={`flex gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-lg ${className}`} role="alert">
      <MapPinOff size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold text-ink">No vemos tu ubicación</p>
        <p className="mt-0.5 text-muted">{compact ? "Usamos tu última ubicación guardada. Permite la ubicación en el navegador." : LOCATION_TEXT[problem]}</p>
        <button
          type="button"
          disabled={trying}
          className="mt-2 font-semibold text-ink underline disabled:opacity-50"
          onClick={() => {
            setTrying(true);
            void locateOnce().finally(() => setTrying(false));
          }}
        >
          {trying ? "Buscando ubicación" : "Reintentar"}
        </button>
      </div>
    </div>
  );
}

/** Pide permiso para avisar de viajes nuevos con notificación y sonido, si aún no lo tiene. */
export function AlertsNotice({ className = "" }: { className?: string }) {
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  if (permission === "granted" || !("Notification" in window)) return null;
  const blocked = permission === "denied";
  return (
    <div className={`flex gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-lg ${className}`}>
      <BellRing size={20} className="mt-0.5 shrink-0 text-brand-strong" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold text-ink">{blocked ? "Los avisos de viajes están bloqueados" : "Activa los avisos de viajes nuevos"}</p>
        <p className="mt-0.5 text-muted">
          {blocked
            ? "Permite las notificaciones de este sitio en el candado junto a la dirección para enterarte aunque tengas otra app abierta."
            : "Te avisamos con notificación y sonido aunque tengas otra app abierta."}
        </p>
        {!blocked && (
          <button
            type="button"
            className="mt-2 font-semibold text-ink underline"
            onClick={() => {
              prepareAlerts();
              void Notification.requestPermission().then(setPermission);
            }}
          >
            Activar avisos
          </button>
        )}
      </div>
    </div>
  );
}
