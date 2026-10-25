import { useEffect, useRef, type ReactNode } from "react";
import Map, { NavigationControl, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { applyStyleConfig, tuneStyle, useMapStyleProps } from "../lib/mapStyle.ts";
import { useMapRecovery } from "../lib/useMapRecovery.ts";
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
  /** Acercamiento máximo al encuadrar: más bajo deja ver la ciudad aunque los puntos estén juntos. */
  maxFitZoom?: number;
  /** Centro de la vista mientras el mapa se mueve, para elegir un punto arrastrando. */
  onMove?: (center: Pin) => void;
};

/** Mapa plano para datos (panel y zonas de demanda): estilo claro, sin 3D, con controles de zoom. */
export function FlatMap({
  children,
  fit,
  fitKey,
  focus,
  zoom = 12.5,
  padding = { top: 60, bottom: 60, left: 60, right: 60 },
  maxFitZoom = 17,
  onMove,
}: Props) {
  const ref = useRef<MapRef>(null);
  const mapStyle = useMapStyleProps();
  const recovery = useMapRecovery();
  const latest = useRef({ fit, padding, maxFitZoom });
  latest.current = { fit, padding, maxFitZoom };

  // Se aplica al cambiar lo que se quiere ver y otra vez al terminar de cargar: antes de eso el mapa ignora el encuadre.
  function frame() {
    const map = ref.current;
    const { fit, padding, maxFitZoom } = latest.current;
    if (!map || !fit || fit.length === 0) return;
    if (fit.length === 1) {
      map.flyTo({ center: [fit[0].longitude, fit[0].latitude], zoom: Math.min(15, maxFitZoom), duration: 600 });
      return;
    }
    const lngs = fit.map((pin) => pin.longitude);
    const lats = fit.map((pin) => pin.latitude);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding, duration: 600, maxZoom: maxFitZoom },
    );
  }

  // Un cambio de tema con el mapa abierto pasa de día a noche sin recrearlo.
  useEffect(() => {
    const map = ref.current?.getMap();
    if (map) applyStyleConfig(map, mapStyle.config);
  }, [mapStyle.config]);

  // Solo se reencuadra cuando cambia lo que se quiere ver, no en cada actualización en vivo.
  useEffect(frame, [fitKey]);

  useEffect(() => {
    if (focus) ref.current?.flyTo({ center: [focus.longitude, focus.latitude], zoom: 16.5, duration: 700 });
  }, [focus?.latitude, focus?.longitude]);

  if (!token) {
    return <div className="grid h-full place-items-center bg-foam text-sm text-muted">Falta el token de Mapbox para mostrar el mapa.</div>;
  }
  return (
    <Map
      key={recovery.key}
      reuseMaps={recovery.reuse}
      ref={ref}
      mapboxAccessToken={token}
      initialViewState={{ latitude: MERIDA.latitude, longitude: MERIDA.longitude, zoom }}
      mapStyle={mapStyle.url}
      config={mapStyle.config}
      onStyleData={() => ref.current && tuneStyle(ref.current.getMap(), mapStyle.url)}
      maxZoom={20}
      style={{ width: "100%", height: "100%" }}
      maxPitch={0}
      pitchWithRotate={false}
      dragRotate={false}
      attributionControl={false}
      onMove={onMove && ((event) => onMove({ latitude: event.viewState.latitude, longitude: event.viewState.longitude }))}
      onLoad={(event) => {
        recovery.watch(event.target);
        applyStyleConfig(event.target, mapStyle.config);
        frame();
      }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {children}
    </Map>
  );
}
