import { Car } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import Map, { type MapMouseEvent, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useCompass } from "../lib/compass.ts";
import { distanceM } from "../lib/guidance.ts";
import { applyStyleConfig, tuneStyle, useMapStyleProps } from "../lib/mapStyle.ts";
import { useMapRecovery } from "../lib/useMapRecovery.ts";

export type Pin = { latitude: number; longitude: number };

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

type Props = {
  center: Pin;
  origin?: Pin | null;
  destination?: Pin | null;
  driver?: Pin | null;
  heading?: number | null;
  route?: number[][] | null;
  stops?: Pin[] | null;
  focus?: Pin | null;
  fit?: boolean;
  fitPadding?: number | { top: number; bottom: number; left: number; right: number };
  pulse?: boolean;
  /** Modo navegación: círculo azul del carro + cámara que sigue + ruta directions. */
  navigate?: boolean;
  /** Si false, no mueve la cámara (el usuario movió el mapa). */
  follow?: boolean;
  /** Incrementar para recentrar al carro. */
  recenterToken?: number;
  onUserPan?: () => void;
  onPick?: (pin: Pin) => void;
  /** El conductor es quien mira el mapa: se dibuja como punto azul con su rumbo, no como carro. */
  driverIsMe?: boolean;
  /** Ubicación de quien mira el mapa (punto azul sin rumbo). */
  me?: Pin | null;
  /** Conductores disponibles cerca, como puntos aproximados mientras se busca. */
  nearby?: Pin[];
  /** Si false, el mapa es solo de vista: no se arrastra ni responde a toques. */
  interactive?: boolean;
};

export function MapView({
  center,
  origin,
  destination,
  driver,
  heading = null,
  route,
  stops,
  focus,
  fit = true,
  fitPadding = 48,
  pulse = false,
  navigate = false,
  follow = true,
  recenterToken = 0,
  onUserPan,
  onPick,
  driverIsMe = false,
  me = null,
  nearby,
  interactive = true,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const mapStyle = useMapStyleProps();
  const recovery = useMapRecovery();
  // Listo solo cuando cargó el mapa actual: al recrearlo, los efectos se vuelven a conectar.
  const [loadedKey, setLoadedKey] = useState(-1);
  const ready = loadedKey === recovery.key;

  // Un cambio de tema con el mapa abierto pasa de día a noche sin recrearlo.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && ready) applyStyleConfig(map, mapStyle.config);
  }, [mapStyle.config, ready]);
  // Sin destino, el punto azul ya marca dónde estás: el pin A encima solo estorba.
  const originIsMe = Boolean(!destination && me && origin && distanceM(origin, me) < 25);
  // Al ir por el pasajero, el destino de la navegación es la misma recogida: basta con el pin A.
  const destinationIsOrigin = Boolean(origin && destination && distanceM(origin, destination) < 25);
  const boxRef = useRef<HTMLDivElement>(null);
  // Cada consulta trae un arreglo nuevo: solo se vuelve a proyectar si cambian las posiciones.
  const nearbyKey = (nearby ?? []).map((pin) => `${pin.latitude},${pin.longitude}`).join(";");
  const [path, setPath] = useState("");
  const [marks, setMarks] = useState<{
    origin: { x: number; y: number } | null;
    destination: { x: number; y: number } | null;
    driver: { x: number; y: number } | null;
    me: { x: number; y: number } | null;
    stops: { x: number; y: number }[];
    nearby: { x: number; y: number }[];
    bearing: number;
  }>({
    origin: null,
    destination: null,
    driver: null,
    me: null,
    stops: [],
    nearby: [],
    bearing: 0,
  });
  const [progress, setProgress] = useState(1);
  const drawnRoute = useRef("");
  const lastCameraAt = useRef(0);
  const routeRef = useRef(route);
  const fitRef = useRef(fit);
  const padRef = useRef(fitPadding);
  const navigateRef = useRef(navigate);
  routeRef.current = route;
  fitRef.current = fit;
  padRef.current = fitPadding;
  navigateRef.current = navigate;

  function frameRoute() {
    const map = mapRef.current?.getMap();
    const line = routeRef.current;
    if (!map || !fitRef.current || navigateRef.current || !line || line.length < 2) return;
    const apply = () => {
      if (!map.isStyleLoaded()) {
        map.once("idle", apply);
        return;
      }
      const lngs = line.map((point) => point[0]);
      const lats = line.map((point) => point[1]);
      map.resize();
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: padRef.current, duration: 400, maxZoom: 17 },
      );
    };
    apply();
  }

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.getMap().resize();
      frameRoute();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Espera a que el mapa cargue: un flyTo previo se pierde y la cámara queda en el centro inicial.
  useEffect(() => {
    if (!ready || !focus || (routeRef.current && routeRef.current.length > 1)) return;
    mapRef.current?.flyTo({ center: [focus.longitude, focus.latitude], zoom: 16.5, duration: 700 });
  }, [focus, ready]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => frameRoute());
    return () => cancelAnimationFrame(frame);
  }, [route, fit, ready, navigate]);

  // Cámara estilo navegación: sigue al carro con rumbo
  useEffect(() => {
    if (!navigate || !ready || !driver || !follow) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const now = performance.now();
    // La geolocalización puede emitir varias posiciones por segundo. Limitar
    // las animaciones evita acumular transiciones WebGL en el renderer.
    if (now - lastCameraAt.current < 500) return;
    lastCameraAt.current = now;
    const bearing = heading != null && !Number.isNaN(heading) ? heading : map.getBearing();
    map.easeTo({
      center: [driver.longitude, driver.latitude],
      zoom: Math.max(map.getZoom(), NAV_ZOOM),
      bearing,
      duration: 350,
      padding: typeof fitPadding === "number" ? { top: 120, bottom: fitPadding, left: 40, right: 40 } : fitPadding,
    });
  }, [navigate, ready, follow, recenterToken, driver?.latitude, driver?.longitude, heading, fitPadding]);

  useEffect(() => {
    if (!navigate || !ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const stopFollow = () => onUserPan?.();
    map.on("dragstart", stopFollow);
    return () => {
      map.off("dragstart", stopFollow);
    };
  }, [navigate, ready, onUserPan]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) {
      setPath("");
      setMarks({ origin: null, destination: null, driver: null, me: null, stops: [], nearby: [], bearing: 0 });
      return;
    }
    const place = (pin: Pin | null | undefined) => {
      if (!pin) return null;
      const projected = map.project([pin.longitude, pin.latitude]);
      return { x: projected.x, y: projected.y };
    };
    const paint = () => {
      if (route && route.length > 1) {
        setPath(
          route
            .map(([lng, lat]) => map.project([lng, lat]))
            // Con la cámara inclinada, los puntos tras el horizonte se proyectan a Infinity/NaN.
            .filter((projected) => Number.isFinite(projected.x) && Number.isFinite(projected.y))
            .map((projected) => `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`)
            .join(" "),
        );
      } else {
        setPath("");
      }
      setMarks({
        origin: place(origin),
        destination: place(destination),
        driver: place(driver),
        me: place(me),
        stops: (stops ?? []).map((stop) => place(stop)).filter((value): value is { x: number; y: number } => Boolean(value)),
        nearby: (nearby ?? []).map((pin) => place(pin)).filter((value): value is { x: number; y: number } => Boolean(value)),
        bearing: map.getBearing(),
      });
    };
    paint();
    // "move" puede dispararse varias veces por cuadro; se agrupa para proyectar una sola vez.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
    };
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("resize", schedule);
    };
  }, [route, ready, origin, destination, driver, stops, nearbyKey]);

  // Solo se anima cuando cambia el destino de la ruta, no cuando se recorta al avanzar.
  const routeKey = route && route.length > 1 ? `${route.at(-1)?.[0]}:${route.at(-1)?.[1]}` : "";
  // Traza la ruta nueva como fracción de su largo proyectado, así el zoom de encuadre no la deforma.
  useEffect(() => {
    if (!routeKey || routeKey === drawnRoute.current) return;
    drawnRoute.current = routeKey;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    const delay = 150;
    const duration = 1100;
    const start = performance.now() + delay;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setProgress(t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setProgress(0);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      drawnRoute.current = "";
      setProgress(1);
    };
  }, [routeKey]);

  // Un solo color de ruta y de pines en todas las pantallas; el azul queda solo para "estás aquí".
  const lineColor = "#0B6E7F";
  const casingColor = "#FFFFFF";
  const lineWidth = navigate ? 9 : 7;
  const drawn = progress < 1 ? partialPath(path, progress) : { points: path, tip: null };

  if (!token) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-surface-dark px-6 text-center text-sm text-white/70">
        Falta el token de Mapbox para mostrar el mapa de calles.
      </div>
    );
  }

  return (
    <div ref={boxRef} className="absolute inset-0">
      <Map
        key={recovery.key}
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={{
          latitude: center.latitude,
          longitude: center.longitude,
          zoom: navigate ? NAV_ZOOM : 15,
          pitch: 0,
          bearing: 0,
        }}
        mapStyle={mapStyle.url}
        config={mapStyle.config}
        maxZoom={20}
        pitchWithRotate={false}
        maxPitch={0}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        interactive={interactive}
        // Solo de vista no se comparte: un mapa reutilizado conserva si se puede mover.
        reuseMaps={recovery.reuse && interactive}
        onLoad={(event) => {
          recovery.watch(event.target);
          tuneStyle(event.target, mapStyle.url);
          applyStyleConfig(event.target, mapStyle.config);
          setLoadedKey(recovery.key);
        }}
        onStyleData={() => mapRef.current && tuneStyle(mapRef.current.getMap(), mapStyle.url)}
        onClick={(event: MapMouseEvent) => onPick?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })}
      />
      {path && (
        <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden="true">
          <polyline points={drawn.points} fill="none" stroke={casingColor} strokeWidth={lineWidth + 3} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={drawn.points} fill="none" stroke={lineColor} strokeWidth={lineWidth} strokeLinejoin="round" strokeLinecap="round" />
          {progress < 1 && drawn.tip && (
            <circle cx={drawn.tip[0]} cy={drawn.tip[1]} r={lineWidth / 2 + 2} fill="#fff" stroke={lineColor} strokeWidth={3} />
          )}
          {progress === 1 &&
            arrowsAlong(path, boxRef.current?.clientWidth ?? 0, boxRef.current?.clientHeight ?? 0).map((arrow) => (
              <path
                key={`${arrow.x}-${arrow.y}`}
                className="ruta-fade"
                d="M-2.5 -3 L1.5 0 L-2.5 3"
                fill="none"
                stroke="#fff"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
              />
            ))}
        </svg>
      )}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
        {marks.nearby.map((point, index) => (
          <span
            key={`${point.x}-${point.y}-${index}`}
            className="absolute grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-[#15803d] text-white shadow-md transition-[left,top] duration-700"
            style={{ left: point.x, top: point.y, transform: "translate(-50%, -50%)" }}
          >
            <Car size={12} strokeWidth={2.6} />
          </span>
        ))}
        {marks.origin && !(navigate && driver) && !originIsMe && (
          <MapPinMarker point={marks.origin} color="#0B6E7F" pulse={pulse || !destination} label="A" />
        )}
        {marks.origin && navigate && driver && <MapPinMarker point={marks.origin} color="#0B6E7F" label="A" />}
        {marks.stops.map((point, index) => (
          <MapPinMarker key={`${point.x}-${point.y}-${index}`} point={point} color="#F59E0B" label={String(index + 1)} />
        ))}
        {marks.destination && !destinationIsOrigin && <FlagMarker point={marks.destination} />}
        {marks.me && !driverIsMe && <LocationDot point={marks.me} heading={null} bearing={marks.bearing} />}
        {marks.driver &&
          (driverIsMe ? (
            <LocationDot point={marks.driver} heading={heading} bearing={marks.bearing} />
          ) : (
            <CarMarker point={marks.driver} heading={onScreen(heading, marks.bearing)} />
          ))}
      </div>
    </div>
  );
}

type Point = { x: number; y: number };


/** Posiciones y ángulos de las flechas de dirección, una cada ~70 px de ruta proyectada. */
function parsePath(path: string) {
  return path ? path.split(" ").map((pair) => pair.split(",").map(Number)) : [];
}

/** Recorta la ruta proyectada a una fracción de su largo y devuelve también la punta. */
function partialPath(path: string, fraction: number) {
  const points = parsePath(path);
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
  let remaining = lengths.reduce((sum, value) => sum + value, 0) * fraction;
  const kept = points.slice(0, 1);
  for (let i = 0; i < lengths.length && remaining > 0; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const t = Math.min(1, remaining / lengths[i]);
    kept.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    remaining -= lengths[i];
  }
  return { points: kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "), tip: kept.at(-1) ?? null };
}

const MAX_ARROWS = 300;

/** Fracción [t0, t1] del segmento que cae dentro del rectángulo (recorte de Liang-Barsky). */
function clipSegment(x1: number, y1: number, x2: number, y2: number, minX: number, minY: number, maxX: number, maxY: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const edges: [number, number][] = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [t0, t1] as const;
}

/**
 * Flechas de dirección cada ~70 px, solo en la parte visible de la ruta: fuera de pantalla
 * la proyección puede medir millones de píxeles y recorrerla completa congela la página.
 */
function arrowsAlong(path: string, width: number, height: number, spacing = 70) {
  const points = parsePath(path);
  const arrows: { x: number; y: number; angle: number }[] = [];
  let carry = spacing / 2;
  for (let i = 1; i < points.length && arrows.length < MAX_ARROWS; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const visible = length > 0 && Number.isFinite(length) ? clipSegment(x1, y1, x2, y2, -spacing, -spacing, width + spacing, height + spacing) : null;
    if (!visible) {
      carry = spacing / 2;
      continue;
    }
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const end = visible[1] * length;
    let at = visible[0] * length + carry;
    while (at < end && arrows.length < MAX_ARROWS) {
      const t = at / length;
      arrows.push({ x: Math.round(x1 + (x2 - x1) * t), y: Math.round(y1 + (y2 - y1) * t), angle });
      at += spacing;
    }
    carry = Math.max(0, at - end);
  }
  return arrows;
}

/**
 * Marcador del vehículo: un auto en círculo verde, siempre derecho para que se reconozca,
 * con una flecha alrededor que apunta hacia donde avanza (cuando el GPS da el rumbo).
 */
/** Zoom al navegar: deja leer nombres de calles y ver el siguiente giro con calma. */
const NAV_ZOOM = 17.5;

/** Rumbo relativo a la pantalla: el mapa puede estar girado al navegar. */
function onScreen(heading: number | null, bearing: number) {
  return heading != null && !Number.isNaN(heading) ? heading - bearing : null;
}

/**
 * Punto azul de "estás aquí" con un cono hacia donde miras: usa el rumbo del GPS si lo hay
 * (al manejar es más estable) y, si no, la brújula del teléfono.
 */
function LocationDot({ point, heading: gpsHeading, bearing }: { point: Point; heading: number | null; bearing: number }) {
  const compass = useCompass(true);
  const heading = onScreen(gpsHeading ?? compass, bearing);
  return (
    <span className="absolute h-0 w-0" style={{ left: point.x, top: point.y }}>
      {heading != null && (
        <span
          className="absolute left-0 top-0 h-[120px] w-[120px]"
          style={{
            transform: `translate(-50%, -50%) rotate(${heading}deg)`,
            background: "conic-gradient(from -32deg, rgba(66,133,244,0.7) 0deg 64deg, transparent 64deg)",
            borderRadius: "50%",
            maskImage: "radial-gradient(circle, #000 12%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(circle, #000 12%, transparent 72%)",
          }}
          aria-hidden="true"
        />
      )}
      <span className="absolute left-0 top-0 h-14 w-14" style={{ transform: "translate(-50%, -50%)" }} aria-hidden="true">
        <span className="ruta-halo" />
      </span>
      <span
        className="absolute left-0 top-0 h-[22px] w-[22px] rounded-full border-[4px] border-white bg-[#4285F4] shadow-[0_1px_6px_rgba(0,0,0,0.35)]"
        style={{ transform: "translate(-50%, -50%)" }}
        aria-label="Tu ubicación"
      />
    </span>
  );
}

function CarMarker({ point, heading }: { point: Point; heading: number | null }) {
  return (
    <span className="absolute h-[52px] w-[52px]" style={{ left: point.x, top: point.y, transform: "translate(-50%, -50%)" }}>
      {heading != null && !Number.isNaN(heading) && (
        <span className="absolute inset-0" style={{ transform: `rotate(${heading}deg)` }} aria-hidden="true">
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[7px] border-b-[9px] border-x-transparent border-b-[#15803d]" />
        </span>
      )}
      <span className="absolute left-1/2 top-1/2 grid h-[38px] w-[38px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white bg-[#15803d] text-white shadow-lg">
        <Car size={19} strokeWidth={2.4} />
      </span>
    </span>
  );
}

function MapPinMarker({
  point,
  color,
  label,
  pulse = false,
}: {
  point: Point;
  color: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className="absolute h-12 w-12" style={{ left: point.x, top: point.y, transform: "translate(-50%, -100%)" }}>
      {pulse && (
        <>
          <span className="absolute left-1/2 top-[46px] h-14 w-14" style={{ transform: "translate(-50%, -50%)" }}>
            <span className="ruta-halo ruta-halo-brand" />
          </span>
          <span className="absolute left-1/2 top-[46px] h-14 w-14" style={{ transform: "translate(-50%, -50%)" }}>
            <span className="ruta-halo ruta-halo-brand ruta-halo-late" />
          </span>
        </>
      )}
      <span className="ruta-drop block h-full w-full">
        <svg className="relative h-12 w-12 drop-shadow-lg" viewBox="0 0 48 56">
          <path d="M24 54C20 46 7 36 7 23a17 17 0 1 1 34 0c0 13-13 23-17 31Z" fill={color} stroke="#fff" strokeWidth="3" />
          <circle cx="24" cy="23" r="9" fill="#fff" />
          <text x="24" y="27" textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>
            {label}
          </text>
        </svg>
      </span>
    </span>
  );
}

function FlagMarker({ point }: { point: Point }) {
  const checker = `flag${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <span className="absolute" style={{ left: point.x, top: point.y }}>
      <span className="absolute h-2.5 w-2.5 rounded-full border-2 border-white bg-night shadow" style={{ transform: "translate(-50%, -50%)" }} />
      <span className="ruta-drop absolute bottom-0 left-0 block">
        <svg width="30" height="36" viewBox="0 0 30 36" className="drop-shadow-md">
          <defs>
            <pattern id={checker} width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#fff" />
              <rect width="4" height="4" fill="#111827" />
              <rect x="4" y="4" width="4" height="4" fill="#111827" />
            </pattern>
          </defs>
          <rect x="0" y="1" width="3" height="35" rx="1.5" fill="#111827" />
          <path d="M3 2h24l-4 7 4 7H3z" fill={`url(#${checker})`} stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}
