from uuid import UUID

from app.core.deps import require_role
from app.db.session import get_db
from app.drivers.demand import demand_for_driver
from app.drivers.payout import get_payout, save_amenities, save_payout, set_require_pin
from app.drivers.service import (
    complaints_received,
    go_offline,
    go_online,
    list_documents,
    pause,
    profile,
    ratings_received,
    save_document,
    statistics,
    update_profile,
)
from app.drivers.work_zone import MAX_RADIUS_M, MIN_RADIUS_M, get_zone, save_zone, set_active
from app.rides.service import active_for_driver, history_for_driver, list_offers
from app.users.models import User
from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/drivers/me", tags=["drivers"])


class NameIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)


class WorkZoneIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_m: int = Field(ge=MIN_RADIUS_M, le=MAX_RADIUS_M)
    active: bool = True


class ActiveIn(BaseModel):
    active: bool


class SecurityIn(BaseModel):
    require_pin: bool


class AmenitiesIn(BaseModel):
    pets: bool = False
    ac: bool = False
    luggage: bool = False
    card: bool = False


class PayoutIn(BaseModel):
    clabe: str = Field(pattern=r"^\d{18}$")
    bank: str = Field(min_length=2, max_length=60)
    holder: str = Field(min_length=3, max_length=100)


class PauseIn(BaseModel):
    minutes: int = Field(default=5, ge=1, le=60)


@router.get("")
def get_me(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return profile(db, user)


@router.patch("")
def patch_me(data: NameIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return update_profile(db, user, data.name)


@router.post("/online")
def online(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return go_online(db, user)


@router.post("/offline")
def offline(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return go_offline(db, user)


@router.post("/pause")
def pause_route(data: PauseIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return pause(db, user, data.minutes)


@router.get("/statistics")
def stats(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return statistics(db, user)


@router.get("/rides")
def rides(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return history_for_driver(db, user)


@router.get("/ratings")
def ratings(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return ratings_received(db, user)


@router.get("/complaints")
def complaints(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return complaints_received(db, user)


@router.get("/ride-offers")
def offers(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return list_offers(db, user)


@router.get("/active")
def active(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return active_for_driver(db, user)


@router.get("/demand")
def demand(hours: int = 2, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return demand_for_driver(db, user, hours)


@router.get("/documents")
def documents(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return list_documents(db, user)


@router.post("/documents")
async def upload_document(
    kind: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    content = await file.read()
    return save_document(db, user, kind, file.filename, content)


_ = UUID


@router.get("/work-zone")
def work_zone(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return get_zone(db, user)


@router.put("/work-zone")
def update_work_zone(data: WorkZoneIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return save_zone(db, user, data.latitude, data.longitude, data.radius_m, data.active)


@router.patch("/work-zone")
def toggle_work_zone(data: ActiveIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return set_active(db, user, data.active)


@router.put("/security")
def update_security(data: SecurityIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return set_require_pin(db, user, data.require_pin)


@router.get("/payout")
def payout(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return get_payout(db, user)


@router.put("/payout")
def update_payout(data: PayoutIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return save_payout(db, user, data.clabe, data.bank, data.holder)


@router.put("/amenities")
def update_amenities(data: AmenitiesIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return save_amenities(db, user, data.model_dump())
