from uuid import UUID

from app.config.settings import settings
from app.core.support import read_point
from app.rides.ranking import Candidate
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Session

# Tipo del vehículo con que trabaja el conductor: el activo más antiguo, como el que ve el pasajero.
VEHICLE_KIND = """COALESCE(
    (SELECT v.kind FROM vehicles v WHERE v.driver_id = d.id AND v.active ORDER BY v.created_at LIMIT 1),
    'auto'
)"""


# Zona de trabajo: dentro de ella solo cuentan viajes que empiezan ahí; fuera, los que dejan al
# conductor más cerca de su zona que donde está ahora. {pos} es la posición del conductor.
WORK_ZONE = """(
    NOT d.work_zone_active
    OR d.work_zone_center IS NULL
    OR (
        ST_DWithin({pos}, d.work_zone_center, d.work_zone_radius_m)
        AND ST_DWithin(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, d.work_zone_center, d.work_zone_radius_m)
    )
    OR (
        NOT ST_DWithin({pos}, d.work_zone_center, d.work_zone_radius_m)
        AND ST_Distance(ST_SetSRID(ST_MakePoint(:dest_lng, :dest_lat), 4326)::geography, d.work_zone_center)
            < ST_Distance({pos}, d.work_zone_center)
    )
)"""


def insert_request(db: Session, params: dict) -> None:
    db.execute(
        text(
            """
            INSERT INTO ride_requests (
                id, passenger_id, origin, destination, origin_label, destination_label,
                estimated_distance_m, estimated_duration_s, estimated_fare, route_geometry, stops,
                service, wave, status, created_at, expires_at
            ) VALUES (
                :id, :passenger_id,
                ST_SetSRID(ST_MakePoint(:origin_lng, :origin_lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(:destination_lng, :destination_lat), 4326)::geography,
                :origin_label, :destination_label,
                :distance_m, :duration_s, :fare, CAST(:geometry AS jsonb), CAST(:stops AS jsonb),
                :service, 0, 'searching', :created_at, :expires_at
            )
            """
        ),
        params,
    )


def insert_ride(db: Session, params: dict) -> None:
    db.execute(
        text(
            """
            INSERT INTO rides (
                id, ride_request_id, passenger_id, driver_id, origin, destination, status, created_at
            )
            SELECT :id, id, passenger_id, :driver_id, origin, destination, 'accepted', :created_at
            FROM ride_requests
            WHERE id = :request_id
            """
        ),
        params,
    )


def request_coords(db: Session, request_id: UUID) -> dict:
    origin = read_point(db, "ride_requests", "id", request_id, "origin")
    destination = read_point(db, "ride_requests", "id", request_id, "destination")
    return {"origin": origin, "destination": destination}


def ride_coords(db: Session, ride_id: UUID) -> dict:
    origin = read_point(db, "rides", "id", ride_id, "origin")
    destination = read_point(db, "rides", "id", ride_id, "destination")
    return {"origin": origin, "destination": destination}


def driver_coords(db: Session, driver_id: UUID) -> dict | None:
    return read_point(db, "driver_locations", "driver_id", driver_id, "location")


def upsert_location(db: Session, driver_id: UUID, latitude: float, longitude: float, heading, speed) -> None:
    db.execute(
        text(
            """
            INSERT INTO driver_locations (driver_id, location, heading, speed, updated_at)
            VALUES (
                :driver_id,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :heading, :speed, NOW()
            )
            ON CONFLICT (driver_id) DO UPDATE SET
                location = EXCLUDED.location,
                heading = EXCLUDED.heading,
                speed = EXCLUDED.speed,
                updated_at = NOW()
            """
        ),
        {
            "driver_id": driver_id,
            "lat": latitude,
            "lng": longitude,
            "heading": heading,
            "speed": speed,
        },
    )


def find_candidates(
    db: Session,
    latitude: float,
    longitude: float,
    radius_m: int,
    limit: int,
    excluded: list[UUID],
    favorites: list[UUID],
    service: str,
    destination: dict,
) -> list[Candidate]:
    """Conductores disponibles dentro del radio: favoritos primero y luego por distancia en línea recta.

    Solo entran los que tienen el vehículo del servicio pedido; un paquete lo lleva auto o moto.
    Quien tiene zona de trabajo activa solo entra si el viaje encaja con ella (ver WORK_ZONE).
    """
    if not excluded:
        excluded = [UUID("00000000-0000-0000-0000-000000000000")]
    if not favorites:
        favorites = [UUID("00000000-0000-0000-0000-000000000000")]
    rows = db.execute(
        text(
            f"""
            SELECT d.id,
                   ST_Y(dl.location::geometry) AS lat,
                   ST_X(dl.location::geometry) AS lng,
                   ST_Distance(dl.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS meters,
                   d.id = ANY(:favorites) AS favorite
            FROM drivers d
            JOIN users u ON u.id = d.user_id
            JOIN driver_locations dl ON dl.driver_id = d.id
            WHERE d.driver_status = 'online'
              AND (d.verification_status = 'approved' OR d.created_at > NOW() - make_interval(days => :grace))
              AND u.status = 'active'
              AND dl.updated_at > NOW() - make_interval(secs => :max_age)
              AND ST_DWithin(
                    dl.location,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius
                  )
              AND EXISTS (
                    SELECT 1 FROM memberships m
                    WHERE m.driver_id = d.id
                      AND m.status = 'active'
                      AND m.starts_at <= NOW()
                      AND m.expires_at > NOW()
                  )
              AND NOT EXISTS (
                    SELECT 1 FROM ride_offers o
                    WHERE o.driver_id = d.id AND o.status = 'countered'
                  )
              AND NOT (d.id = ANY(:excluded))
              AND (:service = 'paquete' OR {VEHICLE_KIND} = :service)
              AND {WORK_ZONE.format(pos="dl.location")}
            ORDER BY
              CASE WHEN d.id = ANY(:favorites) THEN 0 ELSE 1 END,
              ST_Distance(dl.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
            LIMIT :lim
            """
        ).bindparams(
            bindparam("excluded", type_=ARRAY(PG_UUID(as_uuid=True))),
            bindparam("favorites", type_=ARRAY(PG_UUID(as_uuid=True))),
        ),
        {
            "lat": latitude,
            "lng": longitude,
            "radius": radius_m,
            "excluded": excluded,
            "favorites": favorites,
            "service": service,
            "dest_lat": destination["latitude"],
            "dest_lng": destination["longitude"],
            "lim": limit,
            "max_age": settings.location_max_age_s,
            "grace": settings.document_grace_days,
        },
    ).all()
    return [
        Candidate(id=row.id, latitude=row.lat, longitude=row.lng, meters=row.meters, favorite=row.favorite)
        for row in rows
    ]


def find_finishing(
    db: Session,
    latitude: float,
    longitude: float,
    radius_m: int,
    limit: int,
    excluded: list[UUID],
    service: str,
    destination: dict,
) -> list:
    """Conductores con pasajero a bordo cuyo destino queda dentro del radio de la nueva recogida.

    Solo cuentan los que ya no tienen paradas pendientes ni otro viaje en espera.
    """
    if not excluded:
        excluded = [UUID("00000000-0000-0000-0000-000000000000")]
    return db.execute(
        text(
            f"""
            SELECT d.id,
                   ST_Y(dl.location::geometry) AS lat,
                   ST_X(dl.location::geometry) AS lng,
                   ST_Y(r.destination::geometry) AS end_lat,
                   ST_X(r.destination::geometry) AS end_lng,
                   ST_Distance(dl.location, r.destination) AS to_end_m,
                   ST_Distance(r.destination, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS end_to_pickup_m
            FROM drivers d
            JOIN users u ON u.id = d.user_id
            JOIN driver_locations dl ON dl.driver_id = d.id
            JOIN rides r ON r.driver_id = d.id AND r.status = 'in_progress'
            JOIN ride_requests rr ON rr.id = r.ride_request_id
            WHERE d.driver_status = 'busy'
              AND (d.verification_status = 'approved' OR d.created_at > NOW() - make_interval(days => :grace))
              AND u.status = 'active'
              AND dl.updated_at > NOW() - make_interval(secs => :max_age)
              AND r.current_stop_index >= jsonb_array_length(COALESCE(rr.stops, '[]'::jsonb))
              AND ST_DWithin(r.destination, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)
              AND NOT EXISTS (
                    SELECT 1 FROM rides q
                    WHERE q.driver_id = d.id AND q.status IN ('accepted', 'driver_arriving', 'driver_arrived')
                  )
              AND NOT EXISTS (
                    SELECT 1 FROM ride_offers o
                    WHERE o.driver_id = d.id AND o.status = 'countered'
                  )
              AND NOT (d.id = ANY(:excluded))
              AND (:service = 'paquete' OR {VEHICLE_KIND} = :service)
              AND {WORK_ZONE.format(pos="r.destination")}
            ORDER BY end_to_pickup_m
            LIMIT :lim
            """
        ).bindparams(bindparam("excluded", type_=ARRAY(PG_UUID(as_uuid=True)))),
        {
            "lat": latitude,
            "lng": longitude,
            "radius": radius_m,
            "excluded": excluded,
            "service": service,
            "dest_lat": destination["latitude"],
            "dest_lng": destination["longitude"],
            "lim": limit,
            "max_age": settings.location_max_age_s,
            "grace": settings.document_grace_days,
        },
    ).all()


def pickup_distance_m(db: Session, driver_id: UUID, request_id: UUID) -> int | None:
    row = db.execute(
        text(
            """
            SELECT ST_Distance(dl.location, rr.origin) AS meters
            FROM driver_locations dl
            JOIN ride_requests rr ON rr.id = :request_id
            WHERE dl.driver_id = :driver_id
            """
        ),
        {"driver_id": driver_id, "request_id": request_id},
    ).one_or_none()
    if row is None or row.meters is None:
        return None
    return int(row.meters)


def save_place(db: Session, place_id: UUID, passenger_id: UUID, label: str, kind: str, lat: float, lng: float) -> None:
    db.execute(
        text(
            """
            INSERT INTO saved_places (id, passenger_id, label, kind, location)
            VALUES (:id, :passenger_id, :label, :kind, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
            """
        ),
        {"id": place_id, "passenger_id": passenger_id, "label": label, "kind": kind, "lat": lat, "lng": lng},
    )


def list_places(db: Session, passenger_id: UUID) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT id, label, kind,
                   ST_Y(location::geometry) AS lat,
                   ST_X(location::geometry) AS lng
            FROM saved_places
            WHERE passenger_id = :passenger_id
            ORDER BY created_at DESC
            """
        ),
        {"passenger_id": passenger_id},
    ).all()
    return [
        {
            "id": str(row.id),
            "label": row.label,
            "kind": row.kind,
            "latitude": float(row.lat),
            "longitude": float(row.lng),
        }
        for row in rows
    ]
