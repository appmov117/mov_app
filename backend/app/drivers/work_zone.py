"""Zona de trabajo: el conductor recibe viajes que empiezan en su zona o que lo regresan a ella."""

from app.core.errors import AppError
from app.rides.service import driver_for_user
from app.users.models import User
from sqlalchemy import text
from sqlalchemy.orm import Session

MIN_RADIUS_M = 1000
MAX_RADIUS_M = 10000


def get_zone(db: Session, user: User) -> dict | None:
    """Zona guardada del conductor, o None si nunca definió una."""
    driver = driver_for_user(db, user)
    row = db.execute(
        text(
            """
            SELECT ST_Y(work_zone_center::geometry) AS lat, ST_X(work_zone_center::geometry) AS lng,
                   work_zone_radius_m AS radius, work_zone_active AS active
            FROM drivers WHERE id = :id AND work_zone_center IS NOT NULL
            """
        ),
        {"id": driver.id},
    ).one_or_none()
    if row is None:
        return None
    return {"latitude": row.lat, "longitude": row.lng, "radius_m": row.radius, "active": row.active}


def save_zone(db: Session, user: User, latitude: float, longitude: float, radius_m: int, active: bool) -> dict:
    """Guarda el centro y el radio de la zona y si se aplica al recibir viajes.

    Args:
        db: Sesión de base de datos.
        user: Conductor con sesión.
        latitude: Latitud del centro (WGS84).
        longitude: Longitud del centro (WGS84).
        radius_m: Radio en metros, entre 1 y 10 km.
        active: True para filtrar los viajes por la zona.

    Returns:
        La zona guardada.
    """
    if not MIN_RADIUS_M <= radius_m <= MAX_RADIUS_M:
        raise AppError(400, "El radio debe estar entre 1 y 10 km")
    driver = driver_for_user(db, user)
    db.execute(
        text(
            """
            UPDATE drivers SET
                work_zone_center = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                work_zone_radius_m = :radius,
                work_zone_active = :active
            WHERE id = :id
            """
        ),
        {"id": driver.id, "lat": latitude, "lng": longitude, "radius": radius_m, "active": active},
    )
    db.commit()
    return get_zone(db, user)


def set_active(db: Session, user: User, active: bool) -> dict:
    """Enciende o apaga la zona ya guardada."""
    zone = get_zone(db, user)
    if zone is None:
        raise AppError(409, "Primero define tu zona de trabajo")
    return save_zone(db, user, zone["latitude"], zone["longitude"], zone["radius_m"], active)
