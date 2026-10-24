"""Lugares donde los conductores independientes pueden dejar pasajeros pero no recogerlos."""

from math import asin, cos, radians, sin, sqrt

from app.core.errors import AppError

# Reglamento del aeropuerto: solo los servicios autorizados recogen ahí. El radio cubre la
# terminal, el estacionamiento y la vialidad de acceso.
NO_PICKUP = ({"name": "Aeropuerto de Mérida", "latitude": 20.9370, "longitude": -89.6577, "radius_m": 900},)


def _meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    h = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * 6_371_000 * asin(sqrt(h))


def ensure_pickup_allowed(latitude: float, longitude: float) -> None:
    """Rechaza una recogida dentro de una zona restringida.

    Args:
        latitude: Latitud del punto de recogida.
        longitude: Longitud del punto de recogida.
    """
    for zone in NO_PICKUP:
        if _meters(latitude, longitude, zone["latitude"], zone["longitude"]) <= zone["radius_m"]:
            raise AppError(
                400,
                f"No se puede recoger en el {zone['name']}: los conductores solo pueden dejar pasajeros ahí.",
            )
