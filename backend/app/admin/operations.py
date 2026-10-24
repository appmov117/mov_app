"""Operación del panel: viajes en curso, conductores conectados e historial de viajes."""

from uuid import UUID

from app.admin.people import drivers_by_id, passengers_by_id
from app.complaints.models import Complaint
from app.config.settings import settings
from app.core.errors import AppError
from app.core.support import money
from app.messages.models import RideMessage
from app.rides.models import Ride, RideEvent
from app.rides.service import ACTIVE_RIDE, OPEN_REQUEST, present_ride
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

RIDE_FILTERS = {
    "all": None,
    "active": ACTIVE_RIDE,
    "completed": ("completed",),
    "cancelled": ("cancelled",),
}


def _point(lat, lng) -> dict | None:
    return None if lat is None else {"latitude": float(lat), "longitude": float(lng)}


def live(db: Session) -> dict:
    """Foto del momento: conductores con ubicación reciente, viajes en curso y solicitudes abiertas."""
    drivers = db.execute(
        text(
            """
            SELECT d.id, u.name, d.driver_status, l.heading, l.updated_at,
                   ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng
            FROM drivers d
            JOIN users u ON u.id = d.user_id
            JOIN driver_locations l ON l.driver_id = d.id
            WHERE d.driver_status <> 'offline'
              AND l.updated_at > NOW() - make_interval(secs => :age)
            """
        ),
        {"age": settings.location_max_age_s},
    ).all()
    positions = {row.id: _point(row.lat, row.lng) for row in drivers}
    rides = db.execute(
        text(
            """
            SELECT r.id, r.status, r.passenger_id, r.driver_id, r.created_at, r.started_at,
                   q.origin_label, q.destination_label, q.estimated_fare,
                   ST_Y(r.origin::geometry) AS o_lat, ST_X(r.origin::geometry) AS o_lng,
                   ST_Y(r.destination::geometry) AS d_lat, ST_X(r.destination::geometry) AS d_lng
            FROM rides r
            JOIN ride_requests q ON q.id = r.ride_request_id
            WHERE r.status = ANY(:statuses)
            ORDER BY r.created_at
            """
        ),
        {"statuses": list(ACTIVE_RIDE)},
    ).all()
    requests = db.execute(
        text(
            """
            SELECT id, status, created_at, origin_label, destination_label,
                   ST_Y(origin::geometry) AS lat, ST_X(origin::geometry) AS lng
            FROM ride_requests
            WHERE status = ANY(:statuses)
            ORDER BY created_at
            """
        ),
        {"statuses": list(OPEN_REQUEST)},
    ).all()
    passengers = passengers_by_id(db, [row.passenger_id for row in rides])
    people = drivers_by_id(db, [row.id for row in drivers] + [row.driver_id for row in rides])
    return {
        "drivers": [
            {
                "id": str(row.id),
                "name": row.name,
                "status": row.driver_status,
                "plate": people.get(row.id, {}).get("plate"),
                "heading": row.heading,
                "location": positions[row.id],
                "updated_at": row.updated_at.isoformat(),
            }
            for row in drivers
        ],
        "rides": [
            {
                "id": str(row.id),
                "status": row.status,
                "origin": _point(row.o_lat, row.o_lng),
                "destination": _point(row.d_lat, row.d_lng),
                "origin_label": row.origin_label,
                "destination_label": row.destination_label,
                "estimated_fare": money(row.estimated_fare),
                "driver_location": positions.get(row.driver_id),
                "passenger": passengers.get(row.passenger_id),
                "driver": people.get(row.driver_id),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "started_at": row.started_at.isoformat() if row.started_at else None,
            }
            for row in rides
        ],
        "requests": [
            {
                "id": str(row.id),
                "status": row.status,
                "origin": _point(row.lat, row.lng),
                "origin_label": row.origin_label,
                "destination_label": row.destination_label,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in requests
        ],
    }


def list_rides(db: Session, status: str = "all", limit: int = 200) -> list[dict]:
    """Viajes recientes con origen, destino y participantes, filtrados por estado."""
    if status not in RIDE_FILTERS:
        raise AppError(400, "Filtro de viajes inválido")
    query = text(
        f"""
        SELECT r.id, r.status, r.passenger_id, r.driver_id, r.fare_amount, r.payment_method,
               r.distance_m, r.created_at, r.completed_at, q.origin_label, q.destination_label,
               q.estimated_fare
        FROM rides r
        JOIN ride_requests q ON q.id = r.ride_request_id
        {"WHERE r.status = ANY(:statuses)" if RIDE_FILTERS[status] else ""}
        ORDER BY r.created_at DESC
        LIMIT :limit
        """
    )
    params = {"limit": limit} | ({"statuses": list(RIDE_FILTERS[status])} if RIDE_FILTERS[status] else {})
    rows = db.execute(query, params).all()
    passengers = passengers_by_id(db, [row.passenger_id for row in rows])
    drivers = drivers_by_id(db, [row.driver_id for row in rows])
    return [
        {
            "id": str(row.id),
            "status": row.status,
            "origin_label": row.origin_label,
            "destination_label": row.destination_label,
            "fare_amount": money(row.fare_amount),
            "estimated_fare": money(row.estimated_fare),
            "payment_method": row.payment_method,
            "distance_m": row.distance_m,
            "passenger": passengers.get(row.passenger_id),
            "driver": drivers.get(row.driver_id),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        }
        for row in rows
    ]


def ride_detail(db: Session, ride_id: UUID) -> dict:
    """Todo lo que el panel muestra de un viaje: ruta, personas, eventos, quejas y mensajes."""
    ride = db.get(Ride, ride_id)
    if ride is None:
        raise AppError(404, "No encontramos el viaje")
    events = db.scalars(select(RideEvent).where(RideEvent.ride_id == ride.id).order_by(RideEvent.created_at)).all()
    complaints = db.scalars(select(Complaint).where(Complaint.ride_id == ride.id)).all()
    messages = db.scalar(select(func.count()).select_from(RideMessage).where(RideMessage.ride_id == ride.id))
    return present_ride(db, ride) | {
        "passenger": passengers_by_id(db, [ride.passenger_id]).get(ride.passenger_id),
        "driver_contact": drivers_by_id(db, [ride.driver_id]).get(ride.driver_id),
        "events": [
            {"type": event.event_type, "at": event.created_at.isoformat() if event.created_at else None}
            for event in events
        ],
        "complaints": [
            {"id": str(row.id), "author_role": row.author_role, "category": row.category, "status": row.status}
            for row in complaints
        ],
        "message_count": int(messages or 0),
    }
