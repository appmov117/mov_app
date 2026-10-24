from uuid import UUID

from app.complaints.models import Complaint
from app.core.errors import AppError
from app.core.support import audit, track, utcnow
from app.drivers.models import Driver
from app.notifications.service import notify
from app.rides.service import driver_for_user, passenger_for_user
from app.users.models import User
from sqlalchemy import select
from sqlalchemy.orm import Session

CATEGORIES = {"driving", "behavior", "vehicle", "fare", "route", "safety", "other"}
# El conductor reporta al pasajero: no aplica manejo, vehículo ni ruta.
DRIVER_CATEGORIES = {"behavior", "fare", "safety", "no_show", "damage", "other"}


def create_complaint(db: Session, user: User, ride_id: UUID, category: str, description: str | None) -> dict:
    """Registra un reporte del pasajero sobre el conductor, o del conductor sobre el pasajero.

    Args:
        db: Sesión de base de datos.
        user: Pasajero o conductor del viaje.
        ride_id: Viaje reportado.
        category: Motivo del reporte.
        description: Detalle opcional.

    Returns:
        El reporte guardado.
    """
    from app.rides.models import Ride

    by_driver = user.role == "driver"
    if category not in (DRIVER_CATEGORIES if by_driver else CATEGORIES):
        raise AppError(400, "Elige una categoría válida")
    ride = db.get(Ride, ride_id)
    owner_id = driver_for_user(db, user).id if by_driver else passenger_for_user(db, user).id
    if ride is None or (ride.driver_id if by_driver else ride.passenger_id) != owner_id:
        raise AppError(404, "No encontramos el viaje")
    if ride.status not in {"completed", "cancelled", "in_progress"}:
        raise AppError(409, "Todavía no puedes reportar este viaje")
    row = Complaint(
        ride_id=ride.id,
        passenger_id=ride.passenger_id,
        driver_id=ride.driver_id,
        author_role=user.role,
        category=category,
        description=description,
        status="open",
    )
    db.add(row)
    audit(db, user.id, "complaint_created", {"ride_id": str(ride.id), "category": category})
    track(db, user.id, "complaint_created", {"category": category})
    # Un reporte de seguridad del pasajero suspende al conductor mientras se revisa.
    if category == "safety" and not by_driver:
        driver = db.get(Driver, ride.driver_id)
        account = db.get(User, driver.user_id) if driver else None
        if driver:
            driver.driver_status = "offline"
        if account:
            account.status = "suspended"
            audit(db, account.id, "driver_suspended", {"reason": "safety_complaint", "ride_id": str(ride.id)})
            notify(db, account.id, "Cuenta suspendida", "Hay un reporte de seguridad en revisión", None)
    db.commit()
    return _present(row)


def list_mine(db: Session, user: User) -> list[dict]:
    if user.role == "driver":
        mine = (Complaint.driver_id == driver_for_user(db, user).id) & (Complaint.author_role == "driver")
    else:
        mine = (Complaint.passenger_id == passenger_for_user(db, user).id) & (Complaint.author_role == "passenger")
    rows = db.scalars(select(Complaint).where(mine).order_by(Complaint.created_at.desc())).all()
    return [_present(row) for row in rows]


def review(db: Session, admin: User, complaint_id: UUID, status: str) -> dict:
    row = db.get(Complaint, complaint_id)
    if row is None:
        raise AppError(404, "No encontramos la queja")
    if status not in {"reviewing", "resolved", "dismissed"}:
        raise AppError(400, "Estado de queja inválido")
    row.status = status
    row.reviewed_at = utcnow()
    row.reviewed_by = admin.id
    if status == "resolved":
        audit(db, admin.id, "complaint_resolved", {"complaint_id": str(row.id)})
    if status in {"resolved", "dismissed"}:
        author = _author_user_id(db, row)
        if author:
            notify(db, author, "Revisamos tu reporte", "Gracias por avisarnos. Tu reporte ya fue atendido.", {"ride_id": str(row.ride_id)})
    db.commit()
    return _present(row)


def _author_user_id(db: Session, row: Complaint):
    from app.passengers.models import Passenger

    if row.author_role == "driver":
        driver = db.get(Driver, row.driver_id)
        return driver.user_id if driver else None
    passenger = db.get(Passenger, row.passenger_id)
    return passenger.user_id if passenger else None


def _present(row: Complaint) -> dict:
    return {
        "id": str(row.id),
        "ride_id": str(row.ride_id),
        "driver_id": str(row.driver_id),
        "author_role": row.author_role,
        "category": row.category,
        "description": row.description,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
    }
