from uuid import UUID

from app.complaints.service import create_complaint, list_mine
from app.core.deps import require_role
from app.db.session import get_db
from app.users.models import User
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(tags=["complaints"])


class ComplaintIn(BaseModel):
    category: str
    description: str | None = Field(default=None, max_length=1000)


@router.post("/rides/{ride_id}/complaints")
def create(
    ride_id: UUID,
    data: ComplaintIn,
    user: User = Depends(require_role("passenger", "driver")),
    db: Session = Depends(get_db),
):
    return create_complaint(db, user, ride_id, data.category, data.description)


@router.get("/passengers/me/complaints")
def mine(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return list_mine(db, user)


@router.get("/drivers/me/complaints")
def driver_mine(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return list_mine(db, user)
