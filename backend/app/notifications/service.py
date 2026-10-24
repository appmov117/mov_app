from uuid import UUID

from app.core.support import utcnow
from app.notifications import push
from app.notifications.models import Notification, PushSubscription
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


def notify(db: Session, user_id: UUID, title: str, body: str, data: dict | None = None) -> None:
    db.add(Notification(user_id=user_id, title=title, body=body, data=data))
    push.queue(db, user_id, title, body, data)


def save_subscription(db: Session, user_id: UUID, endpoint: str, p256dh: str, auth: str) -> None:
    """Registra el dispositivo; si el endpoint ya existía, pasa al usuario actual."""
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if row is None:
        db.add(PushSubscription(user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth))
    else:
        row.user_id = user_id
        row.p256dh = p256dh
        row.auth = auth


def remove_subscription(db: Session, user_id: UUID, endpoint: str) -> None:
    db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == endpoint, PushSubscription.user_id == user_id
        )
    )


def list_for_user(db: Session, user_id: UUID) -> list[dict]:
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    ).all()
    return [
        {
            "id": str(row.id),
            "title": row.title,
            "body": row.body,
            "data": row.data,
            "read_at": row.read_at.isoformat() if row.read_at else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


def mark_read(db: Session, user_id: UUID, notification_id: UUID) -> None:
    row = db.get(Notification, notification_id)
    if row and row.user_id == user_id and row.read_at is None:
        row.read_at = utcnow()
