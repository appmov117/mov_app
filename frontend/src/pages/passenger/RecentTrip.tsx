import { useQuery } from "@tanstack/react-query";
import { Briefcase, Check, Home as HomeIcon, MapPin, SearchX, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Pin } from "../../components/MapView.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Loading } from "../../components/ui/loading.tsx";
import { api } from "../../lib/api.ts";
import { clockTime, pesos, splitLabel } from "../../lib/format.ts";
import type { TripPreset } from "./Home.tsx";

type Recent = {
  outcome: "completed" | "cancelled" | "expired";
  cancelled_by: "passenger" | "driver" | null;
  destination: Pin;
  destination_label: string | null;
  stops: Pin[];
  estimated_fare: number | null;
  created_at: string | null;
  ride: { id: string; fare_amount: number | null; completed_at: string | null } | null;
};
type Place = { id: string; label: string; kind: string; latitude: number; longitude: number };

/** Lo que ve el pasajero en /pasajero/viaje cuando no hay viaje activo: qué pasó con el último. */
export function RecentTrip() {
  const navigate = useNavigate();
  const recent = useQuery({ queryKey: ["passenger-recent"], queryFn: () => api<Recent | null>("/api/v1/passengers/me/recent") });
  const places = useQuery({ queryKey: ["passenger-places"], queryFn: () => api<Place[]>("/api/v1/passengers/me/places") });
  const data = recent.data;

  useEffect(() => {
    if (recent.isSuccess && !data) navigate("/pasajero", { replace: true });
  }, [recent.isSuccess, data, navigate]);

  if (!data) return <Loading />;

  const { place, service } = splitLabel(data.destination_label);
  const go = (preset: TripPreset) => navigate("/pasajero", { state: { preset } });
  const again = () => go({ destination: data.destination, label: place, stops: data.stops, tier: service === "Paquete" ? "paquete" : "auto" });
  const view = outcomeView(data, place);

  return (
    <div className="flex flex-1 flex-col bg-white px-5 py-8">
      <div className="flex flex-col items-center text-center">
        <span className={`grid h-16 w-16 place-items-center rounded-full ${view.tone}`}>{view.icon}</span>
        <h1 className="mt-4 text-balance text-2xl font-extrabold tracking-tight">{view.title}</h1>
        <p className="mt-2 max-w-[32ch] text-pretty text-sm leading-relaxed text-ink/65">{view.detail}</p>
      </div>

      <div className="mx-auto mt-6 w-full max-w-xs space-y-2">
        {data.outcome === "completed" && data.ride ? (
          <Button onClick={() => navigate(`/pasajero/historial/${data.ride!.id}?recibo=1`)}>Ver recibo</Button>
        ) : (
          <Button onClick={again}>{data.outcome === "expired" ? "Intentar de nuevo" : "Pedir de nuevo"}</Button>
        )}
      </div>

      {(places.data?.length ?? 0) > 0 && (
        <section className="mx-auto mt-8 w-full max-w-sm">
          <h2 className="mb-2 text-sm font-bold text-ink">¿A dónde vas ahora?</h2>
          <ul className="overflow-hidden rounded-2xl border border-line">
            {places.data!.slice(0, 3).map((item) => (
              <li key={item.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  onClick={() => go({ destination: { latitude: item.latitude, longitude: item.longitude }, label: item.label })}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foam text-ink" aria-hidden="true">
                    {item.kind === "home" ? <HomeIcon size={16} /> : item.kind === "work" ? <Briefcase size={16} /> : <MapPin size={16} />}
                  </span>
                  <span className="truncate text-sm font-semibold">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button variant="ghost" size="sm" className="mx-auto mt-auto max-w-xs pt-6" onClick={() => navigate("/pasajero")}>
        Ir al inicio
      </Button>
    </div>
  );
}

function outcomeView(data: Recent, place: string): { icon: ReactNode; tone: string; title: string; detail: string } {
  const time = clockTime(data.ride?.completed_at ?? data.created_at);
  if (data.outcome === "completed") {
    return {
      icon: <Check size={28} aria-hidden="true" />,
      tone: "bg-ok-soft text-ok-strong",
      title: `Llegaste a ${place}`,
      detail: `Viaje terminado${time ? ` a las ${time}` : ""} · ${pesos(data.ride?.fare_amount ?? data.estimated_fare)}`,
    };
  }
  if (data.outcome === "expired") {
    return {
      icon: <SearchX size={28} aria-hidden="true" />,
      tone: "bg-foam text-ink/70",
      title: "No encontramos conductor",
      detail: `Nadie pudo aceptar tu viaje a ${place} a tiempo. Puedes intentarlo de nuevo.`,
    };
  }
  return {
    icon: <X size={28} aria-hidden="true" />,
    tone: "bg-danger-soft text-danger",
    title: "Tu viaje se canceló",
    detail:
      data.cancelled_by === "driver"
        ? `El conductor canceló el viaje a ${place}. Puedes pedir otro ahora mismo.`
        : `Cancelaste el viaje a ${place}${time ? ` (${time})` : ""}.`,
  };
}
