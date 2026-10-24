"""Zonas con demanda para orientar a los conductores conectados."""

import time

import h3
from app.core.errors import AppError
from app.core.hexes import hex_features
from app.rides import repository
from app.rides.ranking import Leg, road_legs
from app.rides.service import driver_for_user
from app.users.models import User
from sqlalchemy import text
from sqlalchemy.orm import Session

# Resolución 8 (unos 0.7 km² por zona): se lee como colonia desde el auto, no como cuadra.
H3_RESOLUTION = 8
# Distancias por calles ya consultadas, por zona del conductor (resolución 9) y zonas destino.
ROAD_CACHE_SECONDS = 600
_road_cache: dict[tuple, tuple[float, list[Leg]]] = {}


def _road_to_zones(here: dict, zones: list[dict]) -> list[Leg] | None:
    """Distancia por calles del conductor a cada zona; reutiliza la consulta durante 10 minutos.

    El conductor se ubica en su hexágono de resolución 9 (unos 0.1 km²): moverse dentro de él
    no cambia la distancia lo suficiente como para pagar otra consulta a Mapbox.
    """
    key = (h3.latlng_to_cell(here["latitude"], here["longitude"], 9), tuple(zone["cell"] for zone in zones))
    now = time.monotonic()
    cached = _road_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]
    rows = road_legs([here], [{"latitude": zone["latitude"], "longitude": zone["longitude"]} for zone in zones])
    if rows is None:
        return None
    for stale in [item for item, (expires, _) in _road_cache.items() if expires <= now]:
        _road_cache.pop(stale, None)
    _road_cache[key] = (now + ROAD_CACHE_SECONDS, rows[0])
    return rows[0]


def demand_for_driver(db: Session, user: User, hours: int) -> dict:
    """Solicitudes recientes por zona, con las que se quedaron sin conductor y la distancia a cada zona.

    Args:
        db: Sesión de base de datos.
        user: Conductor que consulta.
        hours: Ventana hacia atrás, de 1 a 12 horas.

    Returns:
        Una FeatureCollection con `count` y `unserved` por zona, y las 5 zonas a recomendar.
    """
    if not 1 <= hours <= 12:
        raise AppError(400, "Elige entre 1 y 12 horas")
    driver = driver_for_user(db, user)
    here = repository.driver_coords(db, driver.id)
    rows = db.execute(
        text(
            """
            SELECT ST_Y(origin::geometry) AS lat, ST_X(origin::geometry) AS lng, status
            FROM ride_requests
            WHERE created_at >= NOW() - make_interval(hours => :hours)
            """
        ),
        {"hours": hours},
    ).all()
    features = hex_features(
        ((row.lat, row.lng, {"unserved": int(row.status == "expired")}) for row in rows), H3_RESOLUTION
    )
    def straight_m(props: dict) -> float:
        if not here:
            return 0
        return h3.great_circle_distance(
            (here["latitude"], here["longitude"]), (props["latitude"], props["longitude"]), unit="m"
        )

    for feature in features:
        feature["properties"].setdefault("unserved", 0)
    # Primero donde hubo solicitudes sin conductor; luego donde hubo más; a igualdad, la más cercana.
    ranked = sorted(
        (feature["properties"] for feature in features),
        key=lambda props: (-props["unserved"], -props["count"], straight_m(props)),
    )
    zones = [dict(props) for props in ranked[:5]]
    legs = _road_to_zones(here, zones) if here and zones else None
    for index, zone in enumerate(zones):
        leg = legs[index] if legs else None
        by_road = leg is not None and leg.meters is not None
        zone["distance_m"] = round(leg.meters) if by_road else (round(straight_m(zone)) if here else None)
        zone["distance_by_road"] = by_road
    return {
        "type": "FeatureCollection",
        "features": features,
        "hours": hours,
        "total": len(rows),
        "location": here,
        "zones": zones,
    }
