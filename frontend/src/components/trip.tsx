import type { ReactNode } from "react";
import { MapView, type Pin } from "./MapView.tsx";
import { clockTime } from "../lib/format.ts";

type Rating = { rating: number; comment: string | null } | null;

export type TripRide = {
  id: string;
  status: string;
  origin: Pin;
  destination: Pin;
  origin_label: string | null;
  destination_label: string | null;
  stops: Pin[];
  route: { coordinates: number[][] } | null;
  estimated_fare: number | null;
  estimated_distance_m: number | null;
  estimated_duration_s: number | null;
  fare_amount: number | null;
  payment_method: string | null;
  distance_m: number | null;
  duration_s: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  passenger: { name: string } | null;
  driver: {
    name: string;
    rating: number;
    vehicle: { brand: string; model: string; color: string; plate: string } | null;
  } | null;
  passenger_rating: Rating;
  driver_rating: Rating;
};

export function RouteMap({ ride, className = "h-44" }: { ride: TripRide; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-foam ${className}`}>
      <MapView
        center={ride.origin}
        origin={ride.origin}
        destination={ride.destination}
        stops={ride.stops}
        route={ride.route?.coordinates}
        fitPadding={32}
      />
    </div>
  );
}

export function Timeline({ ride }: { ride: TripRide }) {
  const stops = ride.stops.length;
  return (
    <ol className="relative">
      <span className="absolute bottom-7 left-[7px] top-7 w-0.5 bg-line" aria-hidden="true" />
      <Point
        marker={<span className="block h-4 w-4 rounded-full border-[3px] border-ink bg-surface" />}
        label={ride.origin_label ?? "Origen"}
        time={clockTime(ride.started_at)}
      />
      {stops > 0 && (
        <li className="relative flex items-center gap-4 py-1 pl-8 text-xs text-muted">
          {stops} {stops === 1 ? "parada intermedia" : "paradas intermedias"}
        </li>
      )}
      <Point
        marker={<span className="block h-4 w-4 border-[3px] border-ink bg-surface" />}
        label={ride.destination_label?.split(" · ")[0] ?? "Destino"}
        time={clockTime(ride.completed_at)}
      />
    </ol>
  );
}

function Point({ marker, label, time }: { marker: ReactNode; label: string; time: string | null }) {
  return (
    <li className="relative flex items-start gap-4 py-3">
      <span className="relative mt-0.5 shrink-0 bg-surface" aria-hidden="true">{marker}</span>
      <span className="min-w-0 flex-1 text-sm leading-snug">{label}</span>
      {time && <span className="shrink-0 text-sm text-muted">{time}</span>}
    </li>
  );
}
