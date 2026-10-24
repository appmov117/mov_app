from uuid import UUID

from app.core.deps import require_role
from app.db.session import get_db
from app.users.models import User
from app.vehicles.schemas import VehicleCreate, VehicleUpdate
from app.vehicles.service import create_vehicle, delete_vehicle, list_vehicles, update_vehicle
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/drivers/me/vehicles", tags=["vehicles"])


@router.get("")
def get_all(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return list_vehicles(db, user)


@router.post("")
def create(data: VehicleCreate, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return create_vehicle(db, user, data)


@router.patch("/{vehicle_id}")
def update(
    vehicle_id: UUID,
    data: VehicleUpdate,
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    return update_vehicle(db, user, vehicle_id, data)


@router.delete("/{vehicle_id}")
def delete(vehicle_id: UUID, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    delete_vehicle(db, user, vehicle_id)
    return {"ok": True}
