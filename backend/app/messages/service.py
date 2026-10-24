from uuid import UUID

from app.core.errors import AppError
from app.core.support import utcnow
from app.core.ws import driver_room, passenger_room, publish
from app.messages.models import RideMessage
from app.notifications.service import notify
from app.rides.service import ACTIVE_RIDE, _owned_ride
from app.users.models import User
from sqlalchemy import select, update
from sqlalchemy.orm import Session


def _thread_owner(db: Session, user: User, ride_id: UUID):
    ride, driver, passenger = _owned_ride(db, user, ride_id)
    if user.role not in {"passenger", "driver"}:
        raise AppError(403, "Este viaje no es tuyo")
    return ride, driver, passenger


def list_messages(db: Session, user: User, ride_id: UUID) -> list[dict]:
    _thread_owner(db, user, ride_id)
    db.commit()
    rows = db.scalars(
        select(RideMessage).where(RideMessage.ride_id == ride_id).order_by(RideMessage.created_at)
    ).all()
    return [_present(row) for row in rows]


def send_message(db: Session, user: User, ride_id: UUID, body: str) -> dict:
    """Guarda el mensaje y avisa a la otra parte por WebSocket y push.

    Args:
        db: Sesión de base de datos.
        user: Pasajero o conductor del viaje.
        ride_id: Viaje en curso.
        body: Texto del mensaje.

    Returns:
        El mensaje guardado.
    """
    ride, driver, passenger = _thread_owner(db, user, ride_id)
    text = body.strip()
    if not text:
        raise AppError(400, "Escribe un mensaje")
    if ride.status not in ACTIVE_RIDE:
        raise AppError(409, "El viaje ya terminó")
    row = RideMessage(ride_id=ride.id, sender_role=user.role, body=text)
    db.add(row)
    recipient = passenger.user_id if user.role == "driver" else driver.user_id if driver else None
    if recipient:
        notify(
            db, recipient, f"Mensaje de {user.name.split(' ')[0]}", text, {"ride_id": str(ride.id)}
        )
    db.commit()
    publish(
        str(ride.id),
        {"type": "message", "data": _present(row)},
        driver_room(ride.driver_id),
        passenger_room(ride.passenger_id),
    )
    return _present(row)


def mark_read(db: Session, user: User, ride_id: UUID) -> None:
    """Marca como leídos los mensajes que envió la otra parte."""
    _thread_owner(db, user, ride_id)
    db.execute(
        update(RideMessage)
        .where(
            RideMessage.ride_id == ride_id,
            RideMessage.sender_role != user.role,
            RideMessage.read_at.is_(None),
        )
        .values(read_at=utcnow())
    )
    db.commit()


def _present(row: RideMessage) -> dict:
    return {
        "id": str(row.id),
        "sender_role": row.sender_role,
        "body": row.body,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "read_at": row.read_at.isoformat() if row.read_at else None,
    }
