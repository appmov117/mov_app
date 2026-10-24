from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Place:
    label: str
    latitude: float
    longitude: float


class GeocodingProvider:
    async def search(self, query: str) -> list[Place]:
        raise NotImplementedError

    async def reverse(self, latitude: float, longitude: float) -> str | None:
        raise NotImplementedError


class NominatimGeocoding(GeocodingProvider):
    async def search(self, query: str) -> list[Place]:
        if len(query.strip()) < 3:
            return []
        params = {"q": query, "format": "jsonv2", "countrycodes": "mx", "limit": 5}
        headers = {"User-Agent": "ruta-pwa/0.1 (piloto Merida)", "Accept-Language": "es"}
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search", params=params, headers=headers
            )
            response.raise_for_status()
            payload = response.json()
        return [
            Place(label=item.get("display_name", ""), latitude=float(item["lat"]), longitude=float(item["lon"]))
            for item in payload
        ]

    async def reverse(self, latitude: float, longitude: float) -> str | None:
        params = {"lat": latitude, "lon": longitude, "format": "jsonv2"}
        headers = {"User-Agent": "ruta-pwa/0.1 (piloto Merida)", "Accept-Language": "es"}
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse", params=params, headers=headers
            )
            if response.status_code >= 400:
                return None
            return response.json().get("display_name")


geocoding_provider = NominatimGeocoding()
