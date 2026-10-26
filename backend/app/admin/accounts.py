"""Cuentas desde el panel: pasajeros, suspensión y eliminación de datos personales."""

import secrets
from uuid import UUID

from app.auth.models import RefreshToken
from app.core import storage
from app.core.errors import AppError
from app.core.security import hash_password
from app.core.support import audit, money, utcnow
from app.drivers.models import Driver, DriverDocument
from app.notifications.models import Notification, PushSubscription
from app.passengers.models import FavoriteDriver, Passenger, SavedPlace
from app.rides.models import Ride
from app.users.models import User
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

ACTIVE_RIDE = ("accepted", "driver_arriving", "driver_arrived", "in_progress")


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def list_accounts(db: Session) -> list[dict]:
    """Todas las cuentas con su rol, estado y viajes, de la más reciente a la más antigua."""
    rows = db.execute(
        select(User, Passenger.id, Passenger.total_rides, Driver.id, Driver.completed_rides)
        .outerjoin(Passenger, Passenger.user_id == User.id)
        .outerjoin(Driver, Driver.user_id == User.id)
        .order_by(User.created_at.desc())
    ).all()
    return [
        {
            "id": str(user.id),
            "name": user.name,
            "phone": None if user.status == "deleted" else user.phone,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "profile_id": str(pid or did) if pid or did else None,
            "rides": (prides if pid else drides) or 0,
            "created_at": _iso(user.created_at),
        }
        for user, pid, prides, did, drides in rows
    ]


def _count(db: Session, model, passenger_id: UUID) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(model.passenger_id == passenger_id)) or 0)


def passenger_detail(db: Session, passenger_id: UUID) -> dict:
    """Datos de contacto, viajes recientes y lugares guardados de un pasajero."""
    passenger = db.get(Passenger, passenger_id)
    if passenger is None:
        raise AppError(404, "No encontramos al pasajero")
    user = db.get(User, passenger.user_id)
    rides = db.scalars(
        select(Ride).where(Ride.passenger_id == passenger.id).order_by(Ride.created_at.desc()).limit(10)
    ).all()
    return {
        "id": str(passenger.id),
        "user_id": str(user.id),
        "name": user.name,
        "phone": None if user.status == "deleted" else user.phone,
        "email": user.email,
        "status": user.status,
        "total_rides": passenger.total_rides,
        "created_at": _iso(user.created_at),
        "saved_places": _count(db, SavedPlace, passenger.id),
        "favorite_drivers": _count(db, FavoriteDriver, passenger.id),
        "rides": [
            {
                "id": str(ride.id),
                "status": ride.status,
                "fare_amount": money(ride.fare_amount),
                "created_at": _iso(ride.created_at),
            }
            for ride in rides
        ],
    }


def _target(db: Session, admin: User, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if user is None or user.status == "deleted":
        raise AppError(404, "No encontramos la cuenta")
    if user.id == admin.id or user.role == "admin":
        raise AppError(400, "Las cuentas de administrador no se cambian desde aquí")
    return user


def _in_ride(db: Session, user: User) -> bool:
    passenger_id = db.scalar(select(Passenger.id).where(Passenger.user_id == user.id))
    driver_id = db.scalar(select(Driver.id).where(Driver.user_id == user.id))
    return bool(
        db.scalar(
            select(func.count()).select_from(Ride).where(
                Ride.status.in_(ACTIVE_RIDE),
                (Ride.passenger_id == passenger_id) | (Ride.driver_id == driver_id),
            )
        )
    )


def _close_sessions(db: Session, user: User) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.execute(update(Driver).where(Driver.user_id == user.id).values(driver_status="offline"))


def set_account_status(db: Session, admin: User, user_id: UUID, *, active: bool) -> dict:
    """Suspende o reactiva una cuenta; al suspender se cierran sus sesiones."""
    user = _target(db, admin, user_id)
    user.status = "active" if active else "suspended"
    if not active:
        _close_sessions(db, user)
    audit(db, admin.id, "account_reactivated" if active else "account_suspended", {"user_id": str(user.id)})
    db.commit()
    return {"id": str(user.id), "status": user.status}


def delete_account(db: Session, admin: User, user_id: UUID) -> dict:
    """Elimina los datos personales de una cuenta y la deja inservible.

    Se conservan los viajes y pagos sin datos que identifiquen a la persona,
    porque los necesitan las otras cuentas y la contabilidad.

    Args:
        db: Sesión de base de datos.
        admin: Administrador que lo solicita.
        user_id: Cuenta a eliminar.

    Returns:
        El id y el nuevo estado de la cuenta.
    """
    user = _target(db, admin, user_id)
    if _in_ride(db, user):
        raise AppError(409, "La cuenta tiene un viaje en curso. Espera a que termine")
    files = [user.avatar_key] if user.avatar_key else []
    passenger_id = db.scalar(select(Passenger.id).where(Passenger.user_id == user.id))
    driver_id = db.scalar(select(Driver.id).where(Driver.user_id == user.id))
    if passenger_id:
        db.execute(delete(SavedPlace).where(SavedPlace.passenger_id == passenger_id))
        db.execute(delete(FavoriteDriver).where(FavoriteDriver.passenger_id == passenger_id))
    if driver_id:
        files += db.scalars(select(DriverDocument.file_url).where(DriverDocument.driver_id == driver_id)).all()
        db.execute(delete(DriverDocument).where(DriverDocument.driver_id == driver_id))
        db.execute(update(Driver).where(Driver.id == driver_id).values(payout=None))
    db.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
    db.execute(delete(Notification).where(Notification.user_id == user.id))
    _close_sessions(db, user)
    user.name = "Cuenta eliminada"
    user.email = None
    user.phone = f"eliminada-{user.id.hex}"
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.avatar_key = None
    user.status = "deleted"
    audit(db, admin.id, "account_deleted", {"user_id": str(user.id), "role": user.role})
    db.commit()
    for key in files:
        storage.remove(key)
    return {"id": str(user.id), "status": user.status}
