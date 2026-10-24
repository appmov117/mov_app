"""Tiempos y distancias por calles (Matrix API de Mapbox) y orden de los conductores candidatos."""

import logging
from dataclasses import dataclass

import httpx
from app.config.settings import settings

logger = logging.getLogger("ruta")
MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving"
# La Matrix API acepta hasta 25 coordenadas por llamada.
MAX_CANDIDATES = 12


@dataclass(frozen=True)
class Candidate:
    id: object
    latitude: float
    longitude: float
    meters: float
    favorite: bool


@dataclass(frozen=True)
class Leg:
    """Recorrido por calles entre dos puntos."""

    seconds: float | None
    meters: float | None


def road_legs(sources: list[dict], destinations: list[dict]) -> list[list[Leg]] | None:
    """Tiempo y distancia por calles de cada origen a cada destino, en una sola llamada.

    Args:
        sources: Puntos de salida con `latitude` y `longitude`.
        destinations: Puntos de llegada con `latitude` y `longitude`.

    Returns:
        Una fila por origen con un `Leg` por destino, o None si no hay token, en pruebas
        o ante cualquier error: quien llama usa su respaldo y nunca espera más de 2 segundos.
    """
    token = settings.mapbox_access_token
    if settings.testing or not token or not sources or not destinations:
        return None
    # La Matrix API exige al menos 2 elementos: en el caso 1x1 el destino se suma como origen
    # (un trayecto de cero metros) y esa fila se descarta al final.
    padded = len(sources) * len(destinations) < 2
    if padded:
        sources = sources + destinations[:1]
    total = len(sources) + len(destinations)
    if total > 25:
        return None
    points = sources + destinations
    coords = ";".join(f"{point['longitude']:.6f},{point['latitude']:.6f}" for point in points)
    try:
        response = httpx.get(
            f"{MATRIX_URL}/{coords}",
            params={
                "sources": ";".join(str(index) for index in range(len(sources))),
                "destinations": ";".join(str(index) for index in range(len(sources), total)),
                "annotations": "duration,distance",
                "access_token": token,
            },
            timeout=2.0,
        )
        response.raise_for_status()
        body = response.json()
        rows = [
            [Leg(seconds, meters) for seconds, meters in zip(durations, distances, strict=True)]
            for durations, distances in zip(body["durations"], body["distances"], strict=True)
        ]
        return rows[:-1] if padded else rows
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        logger.warning("matrix_unavailable sources=%s destinations=%s", len(sources), len(destinations))
        return None


def pickup_legs(origin: dict, candidates: list[Candidate]) -> list[Leg] | None:
    """Recorrido por calles de cada conductor candidato al punto de recogida.

    Se consulta aun con un solo candidato: no hay nada que ordenar, pero la oferta muestra
    la distancia y el tiempo reales de llegada.
    """
    if not candidates:
        return None
    rows = road_legs([{"latitude": c.latitude, "longitude": c.longitude} for c in candidates], [origin])
    return [row[0] for row in rows] if rows else None


def order_candidates(candidates: list[Candidate], durations: list[float | None] | None, count: int) -> list:
    """Elige a quién ofrecer el viaje: favoritos primero y luego por segundos de llegada.

    Args:
        candidates: Conductores en el orden de PostGIS (distancia en línea recta).
        durations: Segundos de llegada al punto de recogida por calles, en el mismo orden;
            None si no hubo respuesta de la Matrix API.
        count: Cuántos conductores reciben la oferta en esta ronda.

    Returns:
        Los ids de los conductores elegidos.
    """
    def key(item: tuple[int, Candidate]) -> tuple:
        index, candidate = item
        eta = durations[index] if durations else None
        # Sin ETA (sin ruta o sin respuesta) se conserva el orden por distancia, después de los que sí tienen.
        return (not candidate.favorite, eta is None, eta if eta is not None else 0, index)

    return [candidate.id for _, candidate in sorted(enumerate(candidates), key=key)][:count]
