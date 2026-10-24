import type { Pin } from "../components/MapView.tsx";

export function googleMapsUrl(destination: Pin, origin?: Pin | null) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: "driving",
  });
  if (origin) params.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function wazeUrl(destination: Pin) {
  return `https://waze.com/ul?ll=${destination.latitude},${destination.longitude}&navigate=yes`;
}
