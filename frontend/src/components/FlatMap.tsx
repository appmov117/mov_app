import { useEffect, useRef, type ReactNode } from "react";
import Map, { NavigationControl, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMapUrl } from "../lib/mapStyle.ts";
import type { Pin } from "./MapView.tsx";

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
export const MERIDA: Pin = { latitude: 20.9674, longitude: -89.5926 };

type Props = {
  children?: ReactNode;
  /** Puntos a encuadrar; si cambian, la cámara se ajusta una vez. */
  fit?: Pin[];
  fitKey?: string;
  focus?: Pin | null;
  zoom?: number;
  padding?: { top: number; bottom: number; left: number; right: number };
};

/** Mapa plano para datos (panel y zonas de demanda): estilo claro, sin 3D, con controles de zoom. */
export function FlatMap({ children, fit, fitKey, focus, zoom = 12.5, padding = { top: 60, bottom: 60, left: 60, right: 60 } }: Props) {
  const ref = useRef<MapRef>(null);
  const mapUrl = useMapUrl();
  const latest = useRef({ fit, padding });
  latest.current = { fit, padding };

  // Se aplica al cambiar lo que se quiere ver y otra vez al terminar de cargar: antes de eso el mapa ignora el encuadre.
  function frame() {
    const map = ref.current;
    const { fit, padding } = latest.current;
    if (!map || !fit || fit.length === 0) return;
    if (fit.length === 1) {
      map.flyTo({ center: [fit[0].longitude, fit[0].latitude], zoom: 15, duration: 600 });
      return;
    }
    const lngs = fit.map((pin) => pin.longitude);
    const lats = fit.map((pin) => pin.latitude);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding, duration: 600, maxZoom: 15.5 },
    );
  }

  // Solo se reencuadra cuando cambia lo que se quiere ver, no en cada actualización en vivo.
  useEffect(frame, [fitKey]);

  useEffect(() => {
    if (focus) ref.current?.flyTo({ center: [focus.longitude, focus.latitude], zoom: 15.5, duration: 700 });
  }, [focus?.latitude, focus?.longitude]);

  if (!token) {
    return <div className="grid h-full place-items-center bg-foam text-sm text-muted">Falta el token de Mapbox para mostrar el mapa.</div>;
  }
  return (
    <Map
      ref={ref}
      mapboxAccessToken={token}
      initialViewState={{ latitude: MERIDA.latitude, longitude: MERIDA.longitude, zoom }}
      mapStyle={mapUrl}
      style={{ width: "100%", height: "100%" }}
      maxPitch={0}
      pitchWithRotate={false}
      dragRotate={false}
      attributionControl={false}
      onLoad={frame}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {children}
    </Map>
  );
}
