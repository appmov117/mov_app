"""Envío de notificaciones Web Push.

``notify()`` encola el aviso en la sesión y aquí se despacha solo si la transacción se
confirma, en un hilo aparte para no retrasar la respuesta HTTP.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from app.config.settings import settings
from app.db.session import SessionLocal
from app.notifications.models import PushSubscription
from app.users.models import User
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

logger = logging.getLogger("ruta.push")
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="push")
_QUEUE = "push_queue"
# Avisos que deben llegar de inmediato aunque el teléfono esté en ahorro de energía.
_URGENT = {"request_id", "offer_id", "alert_id"}


def enabled() -> bool:
    return bool(
        settings.vapid_public_key
        and settings.vapid_private_key.get_secret_value()
        and settings.vapid_subject
        and not settings.testing
    )


def queue(db: Session, user_id: UUID, title: str, body: str, data: dict | None) -> None:
    """Deja el aviso pendiente hasta que la sesión confirme la transacción."""
    if enabled():
        db.info.setdefault(_QUEUE, []).append((user_id, title, body, data or {}))


@event.listens_for(Session, "after_commit")
def _dispatch(session: Session) -> None:
    items = session.info.pop(_QUEUE, None)
    if items:
        _executor.submit(_send_all, items)


@event.listens_for(Session, "after_rollback")
def _discard(session: Session) -> None:
    session.info.pop(_QUEUE, None)


def _target(role: str, data: dict) -> str:
    """Pantalla que abre la notificación al tocarla."""
    if "alert_id" in data:
        return "/admin"
    if role == "driver":
        return "/conductor/viaje" if "ride_id" in data else "/conductor"
    if role == "passenger":
        return (
            "/pasajero/viaje"
            if {"ride_id", "request_id", "offer_id"} & data.keys()
            else "/pasajero"
        )
    return "/"


def _send_all(items: list[tuple[UUID, str, str, dict]]) -> None:
    db = SessionLocal()
    try:
        for user_id, title, body, data in items:
            user = db.get(User, user_id)
            if user is None:
                continue
            payload = json.dumps(
                {
                    "title": title,
                    "body": body,
                    "url": _target(user.role, data),
                    "tag": next(
                        (f"{key}:{data[key]}" for key in sorted(_URGENT) if key in data), None
                    ),
                }
            )
            urgent = bool(_URGENT & data.keys())
            subscriptions = db.scalars(
                select(PushSubscription).where(PushSubscription.user_id == user_id)
            ).all()
            for subscription in subscriptions:
                _send(db, subscription, payload, urgent)
        db.commit()
    except Exception:
        logger.exception("push_dispatch_failed")
        db.rollback()
    finally:
        db.close()


def _send(db: Session, subscription: PushSubscription, payload: str, urgent: bool) -> None:
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key.get_secret_value(),
            vapid_claims={"sub": settings.vapid_subject},
            ttl=60 if urgent else 3600,
            headers={"Urgency": "high" if urgent else "normal"},
            timeout=10,
        )
    except WebPushException as error:
        status = error.response.status_code if error.response is not None else None
        if status in {404, 410}:
            db.execute(delete(PushSubscription).where(PushSubscription.id == subscription.id))
        else:
            logger.warning("push_failed status=%s", status)
