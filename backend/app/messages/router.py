from uuid import UUID

from app.core.deps import require_role
from app.core.rate_limit import hit
from app.db.session import get_db
from app.messages.service import list_messages, mark_read, send_message
from app.users.models import User
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(tags=["messages"])


class MessageIn(BaseModel):
    body: str = Field(max_length=500)


@router.get("/rides/{ride_id}/messages")
def thread(
    ride_id: UUID,
    user: User = Depends(require_role("passenger", "driver")),
    db: Session = Depends(get_db),
):
    return list_messages(db, user, ride_id)


@router.post("/rides/{ride_id}/messages")
def send(
    ride_id: UUID,
    data: MessageIn,
    user: User = Depends(require_role("passenger", "driver")),
    db: Session = Depends(get_db),
):
    hit(f"ride-message:{user.id}", limit=20, window_seconds=60)
    return send_message(db, user, ride_id, data.body)


@router.post("/rides/{ride_id}/messages/read")
def read(
    ride_id: UUID,
    user: User = Depends(require_role("passenger", "driver")),
    db: Session = Depends(get_db),
):
    mark_read(db, user, ride_id)
    return {"ok": True}
