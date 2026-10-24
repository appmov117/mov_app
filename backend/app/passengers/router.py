from uuid import UUID

from app.core.deps import require_role
from app.db.session import get_db
from app.passengers.service import (
    add_favorite,
    add_place,
    delete_place,
    list_favorites,
    list_places,
    me,
    remove_favorite,
    rides,
    update_me,
)
from app.rides.service import active_for_passenger, recent_for_passenger
from app.users.models import User
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/passengers/me", tags=["passengers"])


class NameIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)


class PlaceIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    kind: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


@router.get("")
def get_me(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return me(db, user)


@router.patch("")
def patch_me(data: NameIn, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return update_me(db, user, data.name)


@router.get("/rides")
def my_rides(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return rides(db, user)


@router.get("/favorites")
def favorites(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return list_favorites(db, user)


@router.post("/favorites/{driver_id}")
def favorite(driver_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return add_favorite(db, user, driver_id)


@router.delete("/favorites/{driver_id}")
def unfavorite(driver_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    remove_favorite(db, user, driver_id)
    return {"ok": True}


@router.get("/active")
def active(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return active_for_passenger(db, user)


@router.get("/recent")
def recent(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return recent_for_passenger(db, user)


@router.post("/places")
def create_place(data: PlaceIn, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    if data.kind not in {"home", "work", "other"}:
        from app.core.errors import AppError

        raise AppError(400, "El lugar debe ser casa, trabajo u otro")
    return add_place(db, user, data.label, data.kind, data.latitude, data.longitude)


@router.get("/places")
def places(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return list_places(db, user)


@router.delete("/places/{place_id}")
def remove_place(place_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    delete_place(db, user, place_id)
    return {"ok": True}
