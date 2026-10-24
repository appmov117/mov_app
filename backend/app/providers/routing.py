import math
from dataclasses import dataclass, field

import httpx

from app.config.settings import settings


@dataclass(frozen=True)
class RouteStep:
    instruction: str
    modifier: str | None
    type: str | None
    name: str | None
    distance_m: int
    duration_s: int
    location: list[float]


@dataclass(frozen=True)
class RouteResult:
    distance_m: int
    duration_s: int
    geometry: list[list[float]]
    steps: list[RouteStep] = field(default_factory=list)


class RoutingProvider:
    async def route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        via: tuple[tuple[float, float], ...] = (),
    ) -> RouteResult:
        raise NotImplementedError


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _spanish_fallback(modifier: str | None, step_type: str | None, name: str | None) -> str:
    street = f" en {name}" if name else ""
    if step_type == "arrive":
        return f"Llegaste a tu destino{street}"
    if step_type == "depart":
        return f"Sal hacia{street}" if name else "Inicia la ruta"
    labels = {
        "uturn": "Da la vuelta",
        "sharp right": "Gira pronunciado a la derecha",
        "right": "Gira a la derecha",
        "slight right": "Inclínate a la derecha",
        "straight": "Sigue recto",
        "slight left": "Inclínate a la izquierda",
        "left": "Gira a la izquierda",
        "sharp left": "Gira pronunciado a la izquierda",
    }
    if modifier in labels:
        return f"{labels[modifier]}{street}"
    if step_type == "turn" and modifier:
        return f"Gira ({modifier}){street}"
    return f"Continúa{street}" if name else "Continúa por la ruta"


class MapboxRouting(RoutingProvider):
    """Ruta por calles con la Directions API de Mapbox. Si falla, usa la aproximación local."""

    async def route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        via: tuple[tuple[float, float], ...] = (),
    ) -> RouteResult:
        fallback = HaversineRouting()
        points = (origin, *via, destination)
        token = settings.mapbox_access_token
        if settings.testing or not token:
            return await fallback.route(origin, destination, via)
        url = "https://api.mapbox.com/directions/v5/mapbox/driving/" + ";".join(
            f"{point[1]},{point[0]}" for point in points
        )
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(
                    url,
                    params={
                        "geometries": "geojson",
                        "overview": "full",
                        "steps": "true",
                        "language": "es",
                        "banner_instructions": "true",
                        "access_token": token,
                    },
                )
                response.raise_for_status()
                payload = response.json()
            route = payload["routes"][0]
            geometry = [[float(lng), float(lat)] for lng, lat in route["geometry"]["coordinates"]]
            steps: list[RouteStep] = []
            for leg in route.get("legs", []):
                for step in leg.get("steps", []):
                    maneuver = step.get("maneuver") or {}
                    modifier = maneuver.get("modifier")
                    step_type = maneuver.get("type")
                    name = step.get("name") or None
                    instruction = maneuver.get("instruction") or _spanish_fallback(modifier, step_type, name)
                    location = maneuver.get("location") or [0.0, 0.0]
                    steps.append(
                        RouteStep(
                            instruction=instruction,
                            modifier=modifier,
                            type=step_type,
                            name=name,
                            distance_m=max(int(step.get("distance") or 0), 0),
                            duration_s=max(int(step.get("duration") or 0), 0),
                            location=[float(location[0]), float(location[1])],
                        )
                    )
            return RouteResult(
                distance_m=max(int(route["distance"]), 1),
                duration_s=max(int(route["duration"]), 60),
                geometry=geometry,
                steps=steps,
            )
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
            return await fallback.route(origin, destination, via)


class HaversineRouting(RoutingProvider):
    """Distancia de calle aproximada. Se puede sustituir por un proveedor real."""

    async def route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        via: tuple[tuple[float, float], ...] = (),
    ) -> RouteResult:
        points = (origin, *via, destination)
        distance_m = 0
        geometry: list[list[float]] = []
        for start, end in zip(points, points[1:]):
            distance_m += max(int(_haversine_m(start[0], start[1], end[0], end[1]) * 1.3), 1)
            geometry.append([start[1], start[0]])
        geometry.append([destination[1], destination[0]])
        speed_m_s = 25_000 / 3600
        duration_s = max(int(distance_m / speed_m_s), 60)
        steps = [
            RouteStep(
                instruction="Continúa hacia el destino",
                modifier="straight",
                type="depart",
                name=None,
                distance_m=max(distance_m, 1),
                duration_s=duration_s,
                location=[origin[1], origin[0]],
            ),
            RouteStep(
                instruction="Llegaste a tu destino",
                modifier=None,
                type="arrive",
                name=None,
                distance_m=0,
                duration_s=0,
                location=[destination[1], destination[0]],
            ),
        ]
        return RouteResult(
            distance_m=max(distance_m, 1),
            duration_s=duration_s,
            geometry=geometry,
            steps=steps,
        )


routing_provider = MapboxRouting()
