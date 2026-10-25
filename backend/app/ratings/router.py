from uuid import UUID

from app.core.deps import get_current_user
from app.db.session import get_db
from app.rides.schemas import RatingIn
from app.rides.service import rate_ride
from app.users.models import User
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(tags=["ratings"])


@router.post("/rides/{ride_id}/rating")
def rate(ride_id: UUID, data: RatingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role not in {"passenger", "driver"}:
        from app.core.errors import AppError

        raise AppError(403, "No puedes calificar este viaje")
    return rate_ride(db, user, ride_id, data.rating, data.comment)
