"""Alta del conductor: meses gratis de membresía y plazo para subir documentos."""

from datetime import datetime, timedelta
from decimal import Decimal

from app.config.settings import settings
from app.core.support import utcnow
from app.drivers.models import Driver, DriverDocument
from app.notifications.models import Notification
from app.notifications.service import notify
from sqlalchemy import select
from sqlalchemy.orm import Session

DOC_KINDS = {"identity", "license", "plate", "vehicle_photo", "driver_photo"}
# Días desde el alta en que se recuerda subir los documentos que faltan.
REMINDER_DAYS = (10, 14)
REVIEW_INTERVAL = timedelta(minutes=10)
_last_review: datetime | None = None


def grace_ends(driver: Driver) -> datetime:
    """Fecha en que vence el plazo para operar sin que el admin apruebe la cuenta."""
    return driver.created_at + timedelta(days=settings.document_grace_days)


def can_operate(driver: Driver) -> bool:
    """True si la cuenta está aprobada o aún corre su plazo de documentos."""
    return driver.verification_status == "approved" or utcnow() < grace_ends(driver)


def welcome(db: Session, driver: Driver) -> None:
    """Regala la membresía inicial y avisa del plazo para subir documentos."""
    from app.memberships.service import open_membership

    open_membership(db, driver.id, Decimal("0"), days=settings.free_membership_days)
    notify(
        db,
        driver.user_id,
        "Bienvenido a Ruta",
        f"Ya puedes recibir viajes. Tienes {settings.document_grace_days} días para subir tus documentos.",
        {"url": "/conductor/documentos"},
    )


def _missing_documents(db: Session, driver: Driver) -> bool:
    sent = db.scalars(
        select(DriverDocument.kind).where(DriverDocument.driver_id == driver.id, DriverDocument.status != "rejected")
    ).all()
    return not DOC_KINDS <= set(sent)


def _sent(db: Session, driver: Driver, key: str) -> bool:
    return (
        db.scalar(
            select(Notification.id).where(
                Notification.user_id == driver.user_id, Notification.data["reminder"].astext == key
            )
        )
        is not None
    )


def review_documents(db: Session) -> None:
    """Recuerda subir documentos a los días 10 y 14 y desconecta a quien venció sin aprobación.

    Se ejecuta desde el ciclo del servidor, como mucho una vez cada diez minutos.
    """
    global _last_review
    now = utcnow()
    if _last_review and now - _last_review < REVIEW_INTERVAL:
        return
    _last_review = now
    # Una semana extra basta para pausar y avisar a quien venció; después ya no se revisa.
    window = now - timedelta(days=settings.document_grace_days + 7)
    drivers = db.scalars(
        select(Driver).where(Driver.verification_status != "approved", Driver.created_at >= window)
    ).all()
    for driver in drivers:
        if not can_operate(driver):
            if driver.driver_status in {"online", "paused"}:
                driver.driver_status = "offline"
            if not _sent(db, driver, "docs-expired"):
                notify(
                    db,
                    driver.user_id,
                    "Tu cuenta está en pausa",
                    "Terminó tu plazo de documentos. Podrás recibir viajes cuando aprobemos tu cuenta.",
                    {"url": "/conductor/documentos", "reminder": "docs-expired"},
                )
            continue
        age = (now - driver.created_at).days
        due = [day for day in REMINDER_DAYS if age >= day]
        if not due or not _missing_documents(db, driver):
            continue
        key = f"docs-{due[-1]}"
        if _sent(db, driver, key):
            continue
        left = max(1, (grace_ends(driver) - now).days)
        notify(
            db,
            driver.user_id,
            "Sube tus documentos",
            f"Te quedan {left} {'día' if left == 1 else 'días'} para subirlos y seguir recibiendo viajes.",
            {"url": "/conductor/documentos", "reminder": key},
        )
