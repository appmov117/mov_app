import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Car, Home as HomeIcon, LocateFixed, MapPin, Package, Plane, Search, ShoppingBag, Star, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MapView, type Pin } from "../../components/MapView.tsx";
import { Shell } from "../../components/Shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import { api } from "../../lib/api.ts";
import { pesos } from "../../lib/format.ts";
import { enablePush } from "../../lib/push.ts";
import { useAnchoredPin } from "../../lib/routeLeg.ts";
import { PANEL_OFFSET, useWide } from "../../lib/useWide.ts";

type Meta = { zone: Pin; zone_name: string };
type Place = { label: string; latitude: number; longitude: number; kind?: string; id?: string; detail?: string };
type Estimate = { distance_m: number; duration_s: number; fare: number; package_fare: number; route: { coordinates: number[][] } };

/** Destino que otra pantalla deja listo al abrir Inicio (p. ej. «Pedir de nuevo»). */
export type TripPreset = { destination: Pin; label: string; detail?: string; stops?: Pin[]; tier?: "auto" | "paquete" };

const fallback: Pin = { latitude: 20.9674, longitude: -89.5926 };
const zoneRadiusM = 35_000;

const shortcuts: Place[] = [
  { label: "Plaza Galerías", detail: "Calle 60, Mérida", latitude: 21.0154, longitude: -89.5846, kind: "other" },
  { label: "Aeropuerto de Mérida", detail: "Carretera a Uman", latitude: 20.937, longitude: -89.6577, kind: "other" },
];

export function PassengerHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const wide = useWide();
  const queryClient = useQueryClient();
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/v1/meta") });
  const savedPlaces = useQuery({
    queryKey: ["passenger-places"],
    queryFn: () => api<Place[]>("/api/v1/passengers/me/places"),
  });
  const active = useQuery({
    queryKey: ["passenger-active"],
    queryFn: () => api<{ request: { id: string } | null; ride: { id: string } | null } | null>("/api/v1/passengers/me/active"),
  });
  const [origin, setOrigin] = useState<Pin>(fallback);
  const [destination, setDestination] = useState<Pin | null>(null);
  const [destinationLabel, setDestinationLabel] = useState("");
  const [destinationDetail, setDestinationDetail] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [tier, setTier] = useState<"auto" | "paquete">("auto");
  const [focus, setFocus] = useState<Pin | null>(null);
  const [locating, setLocating] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [adjustingOrigin, setAdjustingOrigin] = useState(false);
  const [draftOrigin, setDraftOrigin] = useState<Pin>(fallback);
  const [drafts, setDrafts] = useState<Pin[]>([]);
  const [waypoints, setWaypoints] = useState<Pin[]>([]);
  const [notice, setNotice] = useState("");
  const [locationError, setLocationError] = useState<"denied" | "unavailable" | null>(null);
  const located = useRef(false);
  const precise = useRef(false);

  function place(position: GeolocationPosition, center: boolean) {
    const pin = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    located.current = true;
    setLocationError(null);
    setOrigin(pin);
    if (center) setFocus({ ...pin });
  }

  function locationFailed(error: GeolocationPositionError, always = false) {
    if (located.current && !always) return;
    setLocationError(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
  }

  useEffect(() => {
    if (meta.data && !located.current) setOrigin(meta.data.zone);
  }, [meta.data]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("unavailable");
      return;
    }
    // Primero una ubicación rápida (red o caché) para centrar al instante; luego la precisa del GPS.
    navigator.geolocation.getCurrentPosition(
      (position) => place(position, !located.current),
      (error) => locationFailed(error),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 6000 },
    );
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const first = !precise.current;
        precise.current = true;
        place(position, first);
      },
      (error) => locationFailed(error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    if (active.data?.ride || active.data?.request) navigate("/pasajero/viaje");
  }, [active.data, navigate]);

  useEffect(() => {
    if (query.trim().length < 3) return;
    const handle = setTimeout(() => {
      api<Place[]>(`/api/v1/geo/search?q=${encodeURIComponent(query)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  // El GPS cambia en cada lectura; la tarifa solo se recalcula si el origen se movió 30 m.
  const quoteOrigin = useAnchoredPin(origin, 30) ?? origin;
  const estimate = useQuery({
    queryKey: ["estimate", quoteOrigin, destination, waypoints],
    enabled: Boolean(destination),
    placeholderData: (previous, query) => (query?.queryKey[2] === destination ? previous : undefined),
    queryFn: () =>
      api<Estimate>("/api/v1/ride-requests/estimate", {
        method: "POST",
        body: JSON.stringify({
          origin: quoteOrigin,
          destination,
          stops: waypoints,
          origin_label: meta.data?.zone_name ?? "Mérida",
          destination_label: destinationLabel,
        }),
      }),
  });

  const requestRide = useMutation({
    mutationFn: () =>
      api("/api/v1/ride-requests", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination,
          stops: waypoints,
          service: tier,
          origin_label: meta.data?.zone_name ?? "Mérida",
          destination_label: `${destinationLabel || "Destino"} · ${tier === "paquete" ? "Paquete" : "Auto"}`,
        }),
      }),
    onSuccess: () => navigate("/pasajero/viaje"),
  });
  const savePlace = useMutation({
    mutationFn: (place: Place) =>
      api<Place>("/api/v1/passengers/me/places", {
        method: "POST",
        body: JSON.stringify({
          label: shortLabel(place.label),
          kind: "other",
          latitude: place.latitude,
          longitude: place.longitude,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passenger-places"] }),
  });
  const removePlace = useMutation({
    mutationFn: (id: string) => api(`/api/v1/passengers/me/places/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passenger-places"] }),
  });

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        place(position, true);
        setLocating(false);
      },
      (error) => {
        locationFailed(error, true);
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  }

  function addDraft(pin: Pin) {
    if (!insideZone(pin, meta.data?.zone ?? fallback)) {
      setNotice("Ese punto está fuera de la zona de servicio.");
      return;
    }
    setNotice("");
    setDrafts((current) => (current.length >= 5 ? current : [...current, pin]));
  }

  function acceptDrafts() {
    if (drafts.length === 0) return;
    const last = drafts[drafts.length - 1];
    setWaypoints(drafts.slice(0, -1));
    setDestination(last);
    setDestinationLabel(drafts.length === 1 ? "Punto en el mapa" : `${drafts.length} puntos`);
    setDestinationDetail("Mérida");
    setPlacing(false);
    setTier("auto");
  }

  function placePin(pin: Pin, label = "Punto en el mapa", detail = "Mérida") {
    if (!insideZone(pin, meta.data?.zone ?? fallback)) {
      setNotice("Ese punto está fuera de la zona de servicio.");
      return;
    }
    setNotice("");
    setWaypoints([]);
    setDrafts([]);
    setDestination(pin);
    setDestinationLabel(label);
    setDestinationDetail(detail);
    setPlacing(false);
    setTier("auto");
  }

  useEffect(() => {
    const preset = (location.state as { preset?: TripPreset } | null)?.preset;
    if (!preset) return;
    placePin(preset.destination, preset.label, preset.detail ?? "Mérida");
    setWaypoints(preset.stops ?? []);
    if (preset.tier) setTier(preset.tier);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]);

  function choose(place: Place) {
    placePin({ latitude: place.latitude, longitude: place.longitude }, place.label, place.detail ?? "");
    setResults([]);
    setQuery("");
  }

  const fare = estimate.data?.fare ?? 0;
  const eta = estimate.data ? Math.max(1, Math.round(estimate.data.duration_s / 60)) : null;
  const options = [
    { id: "auto" as const, name: "Auto", icon: Car, eta, price: fare },
    { id: "paquete" as const, name: "Paquete", icon: Package, eta, price: estimate.data?.package_fare ?? 0 },
  ];
  const editingMap = placing || adjustingOrigin;
  const favoriteList = savedPlaces.data?.length ? savedPlaces.data : shortcuts;

  function savedMatch(place: Place) {
    return savedPlaces.data?.find(
      (saved) =>
        Math.abs(saved.latitude - place.latitude) < 0.00001 &&
        Math.abs(saved.longitude - place.longitude) < 0.00001,
    );
  }

  return (
    <Shell nav={!destination && !editingMap} scroll={false} full>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`${editingMap ? "relative min-h-0 flex-1" : "relative min-h-[220px] flex-[0_0_46%] md:flex-1"} lg:absolute lg:inset-0`}>
        {/* El mapa se crea cuando ya se sabe que no hay viaje activo: si lo hay, la app salta a esa pantalla. */}
        {active.isSuccess && !active.data?.ride && !active.data?.request ? (
          <MapView
            center={adjustingOrigin ? draftOrigin : destination ?? origin}
            origin={adjustingOrigin ? draftOrigin : origin}
            destination={editingMap ? null : destination}
            stops={placing ? drafts : waypoints}
            route={editingMap ? null : estimate.data?.route.coordinates}
            focus={focus}
            fit={!editingMap && Boolean(destination)}
            fitPadding={wide ? { top: 48, bottom: 48, left: PANEL_OFFSET, right: 48 } : 48}
            onPick={(pin) => {
              if (placing) addDraft(pin);
              if (adjustingOrigin) setDraftOrigin(pin);
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-foam" aria-hidden="true" />
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-surface px-3 py-2 shadow md:hidden">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white">
            <Pin />
          </span>
          <span className="text-sm font-extrabold">Ruta</span>
        </div>
        <Link to="/pasajero/perfil" className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-surface shadow" aria-label="Perfil">
          <UserRound size={18} />
        </Link>
        <button
          type="button"
          aria-label="Mi ubicación"
          disabled={locating}
          onClick={locate}
          className="absolute right-3 top-[60px] z-10 grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow disabled:opacity-60"
        >
          <LocateFixed size={18} />
        </button>
      </div>
      <section className={`relative z-10 -mt-4 overflow-hidden rounded-t-[28px] bg-surface shadow-[0_-8px_30px_rgba(16,24,32,0.06)] lg:absolute lg:left-4 lg:top-4 lg:mt-0 lg:max-h-[calc(100%-2rem)] lg:w-[400px] lg:rounded-[28px] lg:shadow-[0_18px_50px_rgba(16,24,32,0.18)] ${editingMap ? "shrink-0" : "flex min-h-0 flex-1 flex-col md:max-h-[55%] md:flex-none lg:max-h-[calc(100%-2rem)]"}`}>
        {adjustingOrigin && (
          <div className="px-4 pb-4 pt-5">
            <h1 className="text-xl font-extrabold">Ajusta el punto de encuentro</h1>
            <p className="mt-1 text-sm text-muted">Toca el mapa para mover el marcador de recogida.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="line" onClick={() => setAdjustingOrigin(false)}>Volver</Button>
              <Button
                onClick={() => {
                  setOrigin(draftOrigin);
                  setAdjustingOrigin(false);
                }}
              >
                Aceptar punto
              </Button>
            </div>
          </div>
        )}
        {!adjustingOrigin && !destination && (
          <>
            <div className="shrink-0 px-4 pt-4">
            {!placing && <h1 className="text-[26px] font-extrabold tracking-tight">¿A dónde vas?</h1>}
            <div className="mt-3 flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-foam px-3">
              <Search size={18} className="text-muted" />
              <input
                value={query}
                placeholder="Ingresa tu destino"
                className="h-12 w-full bg-transparent outline-none"
                aria-label="Destino"
                enterKeyHint="search"
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearching(event.target.value.trim().length >= 3);
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setSearching(false);
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </label>
            <button
              type="button"
              aria-label="Marcar destino en el mapa"
              aria-pressed={placing}
              onClick={() => {
                setNotice("");
                setDrafts([]);
                setPlacing((value) => !value);
              }}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${placing ? "bg-ink text-surface" : "bg-foam text-ink"}`}
            >
              <MapPin size={18} />
            </button>
            </div>
            {notice && <p className="mt-2 text-sm text-danger">{notice}</p>}
            {locationError && (
              <div className="mt-2 flex items-center gap-3 rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
                <span className="flex-1">
                  {locationError === "denied"
                    ? "Permite el acceso a tu ubicación en el navegador para ubicarte automáticamente."
                    : "No pudimos obtener tu ubicación. Revisa que el GPS esté activo."}
                </span>
                <button type="button" className="shrink-0 font-semibold" disabled={locating} onClick={locate}>
                  {locating ? "Buscando" : "Reintentar"}
                </button>
              </div>
            )}
            {placing && (
              <div className="mt-3 flex items-center gap-3 pb-4">
                <p className="min-w-0 flex-1 text-sm text-muted">
                  {drafts.length === 0 ? "Toca el mapa para agregar puntos" : `${drafts.length} ${drafts.length === 1 ? "punto" : "puntos"}`}
                </p>
                <Button className="w-auto shrink-0" disabled={drafts.length === 0} onClick={acceptDrafts}>
                  Aceptar
                </Button>
              </div>
            )}
            </div>
            {!placing && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {query.trim().length >= 3 && results.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-2xl border border-line">
                {results.map((place) => {
                  const saved = savedMatch(place);
                  return (
                  <li key={`${place.latitude}-${place.longitude}`} className="flex items-center border-b border-line last:border-0">
                    <button type="button" className="min-w-0 flex-1 px-3 py-3 text-left" onClick={() => choose(place)}>
                      <span className="block truncate text-sm font-semibold">{shortLabel(place.label)}</span>
                      <span className="block truncate text-xs text-muted">{place.label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={saved ? "Quitar de favoritos" : "Guardar en favoritos"}
                      className={`mr-2 grid h-10 w-10 place-items-center rounded-full ${saved ? "text-star" : "text-ink/30"}`}
                      onClick={() => saved?.id ? removePlace.mutate(saved.id) : savePlace.mutate(place)}
                    >
                      <Star size={20} fill={saved ? "currentColor" : "none"} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
            {query.trim().length >= 3 && results.length === 0 && (
              <p className="py-5 text-center text-sm text-muted" role="status">
                {searching ? "Buscando direcciones" : "Sin resultados. Prueba con otra calle o marca el destino en el mapa."}
              </p>
            )}
            {query.trim().length < 3 && (
              <p className="mt-4 text-sm font-bold text-ink">
                {savedPlaces.data?.length ? "Tus favoritos" : "Lugares sugeridos"}
              </p>
            )}
            {query.trim().length < 3 && (
            <ul className="mt-2">
              {favoriteList.map((place) => (
                <li key={place.label}>
                  <div className="flex w-full items-center gap-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left" onClick={() => choose(place)}>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-foam text-ink">
                      <PlaceIcon kind={place.kind} label={place.label} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{place.label}</span>
                      <span className="block truncate text-xs text-muted">{place.detail ?? "Lugar guardado"}</span>
                    </span>
                  </button>
                  {place.id && (
                    <button
                      type="button"
                      aria-label={`Quitar ${place.label} de favoritos`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-star"
                      onClick={() => removePlace.mutate(place.id!)}
                    >
                      <Star size={20} fill="currentColor" />
                    </button>
                  )}
                  </div>
                </li>
              ))}
            </ul>
            )}
            {query.trim().length < 3 && savedPlaces.isSuccess && savedPlaces.data.length === 0 && (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                <Star size={14} aria-hidden="true" /> Busca un destino y toca la estrella para guardarlo aquí.
              </p>
            )}
            </div>}
          </>
        )}
        {!adjustingOrigin && destination && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-[26px] font-extrabold tracking-tight">Elige tu viaje</h1>
                <p className="text-sm text-muted">{shortLabel(destinationLabel)}{destinationDetail ? ` · ${destinationDetail}` : ""}</p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-ink underline"
                onClick={() => {
                  setDestination(null);
                  setWaypoints([]);
                  setDrafts([]);
                  setTier("auto");
                }}
              >
                Cambiar
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={tier === option.id}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${tier === option.id ? "border-brand-strong bg-brand-soft" : "border-line bg-surface"}`}
                  onClick={() => setTier(option.id)}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-foam text-ink/70">
                    <option.icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{option.name}</span>
                    <span className="block text-xs text-muted">
                      {option.eta == null ? "Calculando ruta" : `${(estimate.data!.distance_m / 1000).toFixed(1)} km · ${option.eta} min`}
                    </span>
                  </span>
                  <span className="text-lg font-extrabold">{estimate.data ? pesos(option.price) : "—"}</span>
                </button>
              ))}
            </div>
            {requestRide.error && <p className="mt-3 text-sm text-danger">{(requestRide.error as Error).message}</p>}
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
              onClick={() => {
                setDraftOrigin(origin);
                setAdjustingOrigin(true);
              }}
            >
              <MapPin size={17} /> Ajustar punto de encuentro
            </button>
            <Button
              className="mt-4"
              disabled={!estimate.data || requestRide.isPending}
              onClick={() => {
                void enablePush().catch(() => undefined);
                requestRide.mutate();
              }}
            >
              {requestRide.isPending ? "Solicitando" : tier === "paquete" ? "Solicitar paquete" : "Solicitar auto"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted">Pagas directo al conductor.</p>
          </div>
        )}
      </section>
      </div>
    </Shell>
  );
}

function PlaceIcon({ kind, label }: { kind?: string; label: string }) {
  if (kind === "home") return <HomeIcon size={18} />;
  if (kind === "work") return <Briefcase size={18} />;
  if (label.startsWith("Aeropuerto")) return <Plane size={18} />;
  return <ShoppingBag size={18} />;
}

function shortLabel(label: string) {
  return label.split(",")[0];
}

function insideZone(pin: Pin, zone: Pin) {
  return metersBetween(pin, zone) <= zoneRadiusM;
}

function metersBetween(a: Pin, b: Pin) {
  const radius = 6_371_000;
  const p1 = (a.latitude * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dphi = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dlmb = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function Pin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" fill="white" />
      <circle cx="12" cy="10" r="2.3" fill="#0B6E7F" />
    </svg>
  );
}
