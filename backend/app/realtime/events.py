"""Avisa por WebSocket a conductores y pasajeros cuando cambia algo que les concierne.

Los cambios se detectan al hacer flush y se envían solo después del commit, para que el
cliente que vuelve a pedir los datos ya los encuentre guardados.
"""

from typing import Any

from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

from app.core.ws import driver_room, emit, passenger_room
from app.drivers.models import Driver
from app.rides.models import Ride, RideOffer, RideRequest

KEY = "live_rooms"
SYNC = {"type": "sync"}


def _driver_changed(driver: Driver) -> bool:
    state = inspect(driver)
    return state.attrs.driver_status.history.has_changes() or state.attrs.verification_status.history.has_changes()


def _collect(session: Session, _context: Any) -> None:
    rooms: set[str] = session.info.setdefault(KEY, set())
    request_ids = set()
    for obj in (*session.new, *session.dirty, *session.deleted):
        if obj in session.dirty and not session.is_modified(obj):
            continue
        if isinstance(obj, RideOffer):
            rooms.add(driver_room(obj.driver_id))
            request_ids.add(obj.ride_request_id)
        elif isinstance(obj, RideRequest):
            rooms.add(passenger_room(obj.passenger_id))
        elif isinstance(obj, Ride):
            rooms.add(driver_room(obj.driver_id))
            rooms.add(passenger_room(obj.passenger_id))
        elif isinstance(obj, Driver) and _driver_changed(obj):
            rooms.add(driver_room(obj.id))
    if request_ids:
        # Consulta por la conexión para no disparar otro autoflush dentro del flush.
        rows = session.connection().execute(
            select(RideRequest.passenger_id).where(RideRequest.id.in_(request_ids))
        )
        rooms.update(passenger_room(passenger_id) for (passenger_id,) in rows)


def _deliver(session: Session) -> None:
    for room in session.info.pop(KEY, set()):
        emit(room, SYNC)


def _discard(session: Session, *_args: Any) -> None:
    session.info.pop(KEY, None)


def register() -> None:
    """Conecta los eventos a todas las sesiones de SQLAlchemy."""
    if event.contains(Session, "after_flush", _collect):
        return
    event.listen(Session, "after_flush", _collect)
    event.listen(Session, "after_commit", _deliver)
    event.listen(Session, "after_rollback", _discard)
