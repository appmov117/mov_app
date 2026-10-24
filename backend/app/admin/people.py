"""Nombres y datos de contacto para las vistas del panel, resueltos en pocas consultas."""

from collections.abc import Iterable
from uuid import UUID

from app.drivers.models import Driver
from app.passengers.models import Passenger
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import select
from sqlalchemy.orm import Session


def passengers_by_id(db: Session, ids: Iterable[UUID]) -> dict[UUID, dict]:
    """Devuelve nombre y teléfono de cada pasajero."""
    wanted = {item for item in ids if item}
    if not wanted:
        return {}
    rows = db.execute(
        select(Passenger.id, User.id, User.name, User.phone, User.status)
        .join(User, User.id == Passenger.user_id)
        .where(Passenger.id.in_(wanted))
    ).all()
    return {
        pid: {"id": str(pid), "user_id": str(uid), "name": name, "phone": phone, "status": status}
        for pid, uid, name, phone, status in rows
    }


def drivers_by_id(db: Session, ids: Iterable[UUID]) -> dict[UUID, dict]:
    """Devuelve nombre, teléfono y placa de cada conductor."""
    wanted = {item for item in ids if item}
    if not wanted:
        return {}
    rows = db.execute(
        select(Driver.id, User.id, User.name, User.phone, Driver.rating, Vehicle.plate, Vehicle.brand, Vehicle.model)
        .join(User, User.id == Driver.user_id)
        .outerjoin(Vehicle, (Vehicle.driver_id == Driver.id) & Vehicle.active.is_(True))
        .where(Driver.id.in_(wanted))
    ).all()
    return {
        did: {
            "id": str(did),
            "user_id": str(uid),
            "name": name,
            "phone": phone,
            "rating": float(rating),
            "plate": plate,
            "vehicle": f"{brand} {model}".strip() if brand or model else None,
        }
        for did, uid, name, phone, rating, plate, brand, model in rows
    }
