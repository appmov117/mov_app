from uuid import UUID

from app.core.errors import AppError
from app.rides.service import driver_for_user
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import select
from sqlalchemy.orm import Session


def list_vehicles(db: Session, user: User) -> list[dict]:
    driver = driver_for_user(db, user)
    rows = db.scalars(select(Vehicle).where(Vehicle.driver_id == driver.id).order_by(Vehicle.created_at)).all()
    return [_present(row) for row in rows]


def create_vehicle(db: Session, user: User, data) -> dict:
    driver = driver_for_user(db, user)
    plate = data.plate.strip().upper()
    if db.scalar(select(Vehicle).where(Vehicle.plate == plate)):
        raise AppError(409, "Esa placa ya está registrada")
    for current in db.scalars(select(Vehicle).where(Vehicle.driver_id == driver.id)).all():
        current.active = False
    row = Vehicle(
        driver_id=driver.id,
        brand=data.brand.strip(),
        model=data.model.strip(),
        year=data.year,
        color=data.color.strip(),
        plate=plate,
        kind=data.kind,
        active=True,
    )
    db.add(row)
    db.commit()
    return _present(row)


def update_vehicle(db: Session, user: User, vehicle_id: UUID, data) -> dict:
    driver = driver_for_user(db, user)
    row = db.get(Vehicle, vehicle_id)
    if row is None or row.driver_id != driver.id:
        raise AppError(404, "No encontramos el vehículo")
    for field in ("brand", "model", "color"):
        value = getattr(data, field)
        if value:
            setattr(row, field, value.strip())
    if data.year:
        row.year = data.year
    if data.plate:
        plate = data.plate.strip().upper()
        taken = db.scalar(select(Vehicle).where(Vehicle.plate == plate, Vehicle.id != row.id))
        if taken:
            raise AppError(409, "Esa placa ya está registrada")
        row.plate = plate
    if data.kind:
        row.kind = data.kind
    if data.active is not None:
        row.active = data.active
    db.commit()
    return _present(row)


def delete_vehicle(db: Session, user: User, vehicle_id: UUID) -> None:
    driver = driver_for_user(db, user)
    row = db.get(Vehicle, vehicle_id)
    if row is None or row.driver_id != driver.id:
        raise AppError(404, "No encontramos el vehículo")
    row.active = False
    db.commit()


def _present(row: Vehicle) -> dict:
    return {
        "id": str(row.id),
        "brand": row.brand,
        "model": row.model,
        "year": row.year,
        "color": row.color,
        "plate": row.plate,
        "kind": row.kind,
        "active": row.active,
    }
