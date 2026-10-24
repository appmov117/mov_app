from uuid import UUID

from app.core.deps import require_role
from app.core.rate_limit import hit
from app.db.session import get_db
from app.safety.service import (
    attend_alert,
    create_alert,
    list_alerts,
    list_recordings,
    recording_file,
    save_recording,
)
from app.users.models import User
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(tags=["safety"])


class AlertIn(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


@router.post("/rides/{ride_id}/safety/alerts")
def alert(
    ride_id: UUID,
    data: AlertIn,
    user: User = Depends(require_role("passenger")),
    db: Session = Depends(get_db),
):
    hit(f"safety-alert:{user.id}", limit=5, window_seconds=60)
    return create_alert(db, user, ride_id, data.latitude, data.longitude)


@router.post("/rides/{ride_id}/safety/recordings")
def recording(
    ride_id: UUID,
    kind: str = Form(...),
    session_id: UUID = Form(...),
    segment: int = Form(0, ge=0, le=10_000),
    file: UploadFile = File(...),
    user: User = Depends(require_role("passenger")),
    db: Session = Depends(get_db),
):
    hit(f"safety-recording:{user.id}", limit=20, window_seconds=60)
    return save_recording(
        db, user, ride_id, kind, session_id, segment, file.content_type, file.file
    )


@router.get("/admin/safety/alerts")
def alerts(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return list_alerts(db)


@router.post("/admin/safety/alerts/{alert_id}/attend")
def attend(
    alert_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)
):
    return attend_alert(db, user, alert_id)


@router.get("/admin/safety/recordings")
def recordings(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return list_recordings(db)


@router.get("/admin/safety/recordings/{recording_id}/file")
def recording_download(
    recording_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)
):
    content, mime = recording_file(db, recording_id)
    return Response(content, media_type=mime)
