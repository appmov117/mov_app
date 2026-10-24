from uuid import UUID

from app.config.settings import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.notifications import push
from app.notifications.service import (
    list_for_user,
    mark_read,
    remove_subscription,
    save_subscription,
)
from app.users.models import User
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushIn(BaseModel):
    endpoint: str = Field(max_length=2048, pattern=r"^https://")
    p256dh: str = Field(max_length=256)
    auth: str = Field(max_length=128)


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=2048)


@router.get("")
def inbox(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_for_user(db, user.id)


@router.post("/{notification_id}/read")
def read(
    notification_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    mark_read(db, user.id, notification_id)
    db.commit()
    return {"ok": True}


@router.get("/vapid-public")
def vapid_public():
    return {"public_key": settings.vapid_public_key if push.enabled() else None}


@router.post("/push")
def subscribe(data: PushIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    save_subscription(db, user.id, data.endpoint, data.p256dh, data.auth)
    db.commit()
    return {"ok": True}


@router.post("/push/remove")
def unsubscribe(
    data: EndpointIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    remove_subscription(db, user.id, data.endpoint)
    db.commit()
    return {"ok": True}
