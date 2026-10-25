import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Car, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Home as HomeIcon, LocateFixed, MapPin, Motorbike, Package, User as Person, Plane, Search, ShoppingBag, Star, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MapView, type Pin } from "../../components/MapView.tsx";
import { Shell } from "../../components/Shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import { arrivalClock, EMPTY_PACKAGE, OfferPrice, PackageForm, packageReady, SurchargeNotice } from "../../components/RideOptions.tsx";
import { api } from "../../lib/api.ts";
import { pesos } from "../../lib/format.ts";
import { enablePush } from "../../lib/push.ts";
import { useAnchoredPin } from "../../lib/routeLeg.ts";
import { PANEL_OFFSET, useWide } from "../../lib/useWide.ts";
import { setPosition, usePosition } from "../../lib/position.ts";

type Meta = { zone: Pin; zone_name: string };
type Place = { label: string; latitude: number; longitude: number; kind?: string; id?: string; detail?: string };
type Estimate = {
  distance_m: number;
  duration_s: number;
  fare: number;
  moto_fare: number;
  package_fare: number;
  moto_package_fare: number;
  surcharge: { percent: number; label: string | null } | null;
  route: { coordinates: number[][] };
};

/** Destino que otra pantalla deja listo al abrir Inicio (p. ej. «Pedir de nuevo»). */
export type TripPreset = { destination: Pin; label: string; detail?: string; stops?: Pin[]; tier?: Tier };
type Tier = "auto" | "moto" | "paquete" | "paquete_moto";
const TIER_NAMES: Record<Tier, string> = { auto: "Auto", moto: "Moto", paquete: "Paquete en carro", paquete_moto: "Paquete en moto" };

const fallback: Pin = { latitude: 20.9674, longitude: -89.5926 };
const zoneRadiusM = 35_000;

const shortcuts: Place[] = [
  { label: "Plaza Galerías", detail: "Calle 60, Mérida", latitude: 21.0154, longitude: -89.5846, kind: "other" },
];

const HIDDEN_KEY = "ruta-hidden-suggestions";

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function PassengerHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const wide = useWide();
  const queryClient = useQueryClient();
  const gps = usePosition();
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
  const [tier, setTier] = useState<Tier>("auto");
  const [offered, setOffered] = useState<number | null>(null);
  const [parcel, setParcel] = useState(EMPTY_PACKAGE);
  const sending = tier === "paquete" || tier === "paquete_moto";
  // Paquete abre su propia sección con el vehículo y los datos de quien recibe.
  const packageStep = sending;
  // "¿A dónde vas?" se puede reducir a su encabezado para ver más mapa.
  const [searchCollapsed, setSearchCollapsed] = useState(false);
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
    setPosition(position);
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
    // Un rechazo del servidor (p. ej., recoger en el aeropuerto) no cambia al reintentar.
    retry: false,
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
          offered_fare: offered ?? undefined,
          package: sending ? parcel : undefined,
          origin_label: meta.data?.zone_name ?? "Mérida",
          destination_label: `${destinationLabel || "Destino"} · ${TIER_NAMES[tier]}`,
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
  const prices: Record<Tier, number> = {
    auto: fare,
    moto: estimate.data?.moto_fare ?? 0,
    paquete: estimate.data?.package_fare ?? 0,
    paquete_moto: estimate.data?.moto_package_fare ?? 0,
  };
  const options = [
    { id: "auto" as const, name: "Auto", icon: Car, seats: 4, price: prices.auto, package: false },
    { id: "moto" as const, name: "Moto", icon: Motorbike, seats: 1, price: prices.moto, package: false },
    { id: "paquete" as const, name: "Paquete", icon: Package, seats: 0, price: Math.min(prices.paquete, prices.paquete_moto), package: true },
  ];
  const editingMap = placing || adjustingOrigin;
  const panelCollapsed = searchCollapsed && !destination && !adjustingOrigin;
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const favoriteList = savedPlaces.data?.length ? savedPlaces.data : shortcuts.filter((place) => !hidden.includes(place.label));

  function hideSuggestion(label: string) {
    const next = [...hidden, label];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // Sin almacenamiento se oculta solo mientras la pantalla siga abierta.
    }
  }

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
      <div className={`${editingMap || panelCollapsed ? "relative min-h-0 flex-1" : "relative min-h-[220px] flex-[0_0_46%] md:flex-1"} lg:absolute lg:inset-0`}>
        {/* El mapa sale de inmediato, aunque el servidor tarde; solo se oculta si ya hay un viaje activo. */}
        {!active.data?.ride && !active.data?.request ? (
          <MapView
            center={adjustingOrigin ? draftOrigin : destination ?? origin}
            origin={adjustingOrigin ? draftOrigin : origin}
            destination={editingMap ? null : destination}
            stops={placing ? drafts : waypoints}
            route={editingMap ? null : estimate.data?.route.coordinates}
            focus={focus}
            fit={!editingMap && Boolean(destination)}
            fitPadding={wide ? { top: 48, bottom: 48, left: PANEL_OFFSET, right: 48 } : 48}
            me={gps}
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
      <section className={`relative z-10 -mt-4 overflow-hidden rounded-t-[28px] bg-surface shadow-[0_-8px_30px_rgba(16,24,32,0.06)] lg:absolute lg:left-4 lg:top-4 lg:mt-0 lg:max-h-[calc(100%-2rem)] lg:w-[400px] lg:rounded-[28px] lg:shadow-[0_18px_50px_rgba(16,24,32,0.18)] ${editingMap || panelCollapsed ? "shrink-0 pb-3" : "flex min-h-0 flex-1 flex-col md:max-h-[55%] md:flex-none lg:max-h-[calc(100%-2rem)]"}`}>
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
            {!placing && (
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={!searchCollapsed}
                onClick={() => setSearchCollapsed((value) => !value)}
              >
                <h1 className="text-[26px] font-extrabold tracking-tight">¿A dónde vas?</h1>
                {searchCollapsed ? <ChevronUp size={24} className="text-muted" aria-hidden="true" /> : <ChevronDown size={24} className="text-muted" aria-hidden="true" />}
              </button>
            )}
            <div className={`mt-3 items-center gap-2 ${searchCollapsed && !placing ? "hidden" : "flex"}`}>
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
            {!placing && !searchCollapsed && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
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
                {savedPlaces.data?.length ? "Tus favoritos" : favoriteList.length ? "Lugares sugeridos" : ""}
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
                  {place.id ? (
                    <button
                      type="button"
                      aria-label={`Quitar ${place.label} de favoritos`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-star"
                      onClick={() => removePlace.mutate(place.id!)}
                    >
                      <Star size={20} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Quitar ${place.label} de sugeridos`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted"
                      onClick={() => hideSuggestion(place.label)}
                    >
                      <X size={18} />
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
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-3">
              {packageStep ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Volver a las opciones"
                      className="grid h-9 w-9 place-items-center rounded-full bg-foam"
                      onClick={() => {
                        setTier("auto");
                        setOffered(null);
                      }}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-xl font-extrabold tracking-tight">Detalles del envío</h1>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-foam p-1" role="radiogroup" aria-label="Vehículo del envío">
                    {(["paquete", "paquete_moto"] as const).map((id) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={tier === id}
                        className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold ${tier === id ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
                        onClick={() => {
                          setTier(id);
                          setOffered(null);
                        }}
                      >
                        {id === "paquete" ? <Car size={15} aria-hidden="true" /> : <Motorbike size={15} aria-hidden="true" />}
                        {id === "paquete" ? "En carro" : "En moto"} · {estimate.data ? pesos(prices[id]) : "—"}
                      </button>
                    ))}
                  </div>
                  <PackageForm value={parcel} onChange={setParcel} />
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-xl font-extrabold tracking-tight">Elige tu viaje</h1>
                      <p className="truncate text-sm text-muted">{shortLabel(destinationLabel)}{destinationDetail ? ` · ${destinationDetail}` : ""}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-sm font-semibold text-ink underline"
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
                  <SurchargeNotice surcharge={estimate.data?.surcharge} />
                  <div className="mt-2 space-y-1.5">
                    {options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={tier === option.id}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left ${tier === option.id ? "border-brand-strong bg-brand-soft" : "border-line bg-surface"}`}
                        onClick={() => {
                          setTier(option.package ? "paquete" : option.id);
                          setOffered(null);
                        }}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foam text-ink/70">
                          <option.icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 font-bold">
                            {option.name}
                            {option.seats > 0 && (
                              <span className="flex items-center text-xs font-semibold text-muted" aria-label={`${option.seats} ${option.seats === 1 ? "pasajero" : "pasajeros"}`}>
                                <Person size={12} aria-hidden="true" />
                                {option.seats}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {option.package ? "En carro o en moto" : eta == null ? "Calculando ruta" : `Llegas ${arrivalClock(estimate.data!.duration_s)} · ${eta} min`}
                          </span>
                        </span>
                        <span className="shrink-0 text-base font-extrabold">
                          {estimate.data ? `${option.package ? "desde " : ""}${pesos(option.price)}` : "—"}
                        </span>
                        {option.package && <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="shrink-0 border-t border-line px-4 pb-3 pt-2">
              {estimate.data && offered != null && <OfferPrice minimum={prices[tier]} value={offered} onChange={setOffered} />}
              {(requestRide.error ?? estimate.error) && (
                <p className="mb-2 text-sm text-danger" role="alert">{((requestRide.error ?? estimate.error) as Error).message}</p>
              )}
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                {offered == null ? (
                  <button type="button" className="text-brand-strong underline disabled:opacity-50" disabled={!estimate.data} onClick={() => setOffered(Math.round(prices[tier]))}>
                    Pon tu precio
                  </button>
                ) : (
                  <span className="text-xs font-normal text-muted">El conductor acepta tu precio o propone otro</span>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1 text-ink"
                  onClick={() => {
                    setDraftOrigin(origin);
                    setAdjustingOrigin(true);
                  }}
                >
                  <MapPin size={15} aria-hidden="true" /> Punto de encuentro
                </button>
              </div>
              <Button
                disabled={
                  !estimate.data ||
                  requestRide.isPending ||
                  (sending && !packageReady(parcel)) ||
                  (offered != null && offered < Math.ceil(prices[tier] * 0.8))
                }
                onClick={() => {
                  void enablePush().catch(() => undefined);
                  requestRide.mutate();
                }}
              >
                {requestRide.isPending
                  ? "Solicitando"
                  : `${sending ? "Solicitar envío" : `Solicitar ${TIER_NAMES[tier].toLowerCase()}`} · ${pesos(offered ?? prices[tier])}`}
              </Button>
            </div>
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
