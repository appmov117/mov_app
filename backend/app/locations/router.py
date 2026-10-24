from app.core.deps import require_role
from app.db.session import get_db
from app.locations.service import update_location
from app.users.models import User
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(tags=["locations"])


class LocationIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    heading: float | None = None
    speed: float | None = None


@router.put("/drivers/me/location")
def put_location(data: LocationIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return update_location(db, user, data.latitude, data.longitude, data.heading, data.speed)
