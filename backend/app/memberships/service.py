from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from app.config.settings import settings
from app.core.app_settings import half_payment_url, payment_url
from app.core.errors import AppError
from app.core.support import days_remaining, utcnow
from app.drivers.models import Driver
from app.memberships.models import Membership, MembershipPayment
from app.referrals.models import DriverReward
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def active_membership(db: Session, driver_id: UUID) -> Membership | None:
    now = utcnow()
    return db.scalars(
        select(Membership)
        .where(
            Membership.driver_id == driver_id,
            Membership.status == "active",
            Membership.starts_at <= now,
            Membership.expires_at > now,
        )
        .order_by(Membership.expires_at.desc())
    ).first()


def latest_membership(db: Session, driver_id: UUID) -> Membership | None:
    return db.scalars(
        select(Membership).where(Membership.driver_id == driver_id).order_by(Membership.expires_at.desc())
    ).first()


def has_pending_payment(db: Session, driver_id: UUID) -> bool:
    payment = db.scalars(
        select(MembershipPayment).where(
            MembershipPayment.driver_id == driver_id,
            MembershipPayment.status == "pending",
        )
    ).first()
    return payment is not None


# Recompensa por 10 pasajeros referidos en un mes: la siguiente renovación cuesta la mitad.
HALF_PRICE_REWARD = "pax10-half"


def _half_price_pending(db: Session, driver_id: UUID) -> bool:
    """True si ganó la mitad de precio y aún no la usa en un pago pendiente o aprobado."""
    earned = db.scalar(
        select(func.count())
        .select_from(DriverReward)
        .where(DriverReward.driver_id == driver_id, DriverReward.reward_key.like(f"%:{HALF_PRICE_REWARD}"))
    )
    if not earned:
        return False
    used = db.scalar(
        select(func.count())
        .select_from(MembershipPayment)
        .where(
            MembershipPayment.driver_id == driver_id,
            MembershipPayment.amount == settings.membership_price / 2,
            MembershipPayment.status.in_(("pending", "approved")),
        )
    )
    return earned > used


def renewal_terms(db: Session, driver_id: UUID) -> tuple[Decimal, str, str | None]:
    """Precio, liga y descuento de la siguiente renovación del conductor.

    La mitad de precio solo aplica cuando el admin ya configuró su liga; mientras no exista,
    el descuento se conserva para la siguiente vez.
    """
    half_url = half_payment_url(db)
    if half_url and _half_price_pending(db, driver_id):
        return settings.membership_price / 2, half_url, "half"
    return settings.membership_price, payment_url(db), None


def membership_view(db: Session, driver_id: UUID) -> dict:
    current = active_membership(db, driver_id)
    latest = latest_membership(db, driver_id)
    price, url, discount = renewal_terms(db, driver_id)
    if current:
        status = "active"
        expires = current.expires_at
    elif has_pending_payment(db, driver_id):
        status = "pending"
        expires = latest.expires_at if latest else None
    elif latest and latest.expires_at <= utcnow():
        status = "expired"
        expires = latest.expires_at
    else:
        status = "none"
        expires = None
    return {
        "status": status,
        "expires_at": expires.isoformat() if expires else None,
        "days_remaining": days_remaining(expires) if expires and status == "active" else 0,
        "price": float(price),
        "days": settings.membership_days,
        "payment_url": url,
        "discount": discount,
    }


def require_active_membership(db: Session, driver: Driver) -> Membership:
    if driver.verification_status != "approved":
        raise AppError(403, "Tu cuenta todavía está en revisión")
    current = active_membership(db, driver.id)
    if current is None:
        raise AppError(403, "Necesitas una membresía vigente para conectarte")
    return current


def open_membership(db: Session, driver_id: UUID, amount: Decimal, days: int | None = None) -> Membership:
    now = utcnow()
    latest = db.scalars(
        select(Membership)
        .where(Membership.driver_id == driver_id, Membership.status == "active", Membership.expires_at > now)
        .order_by(Membership.expires_at.desc())
    ).first()
    start = latest.expires_at if latest else now
    span = days if days is not None else settings.membership_days
    membership = Membership(
        driver_id=driver_id,
        starts_at=start,
        expires_at=start + timedelta(days=span),
        amount=amount,
        status="active",
    )
    db.add(membership)
    db.flush()
    return membership


def add_bonus_days(db: Session, driver_id: UUID, days: int) -> None:
    if days <= 0:
        return
    now = utcnow()
    latest = db.scalars(
        select(Membership)
        .where(Membership.driver_id == driver_id, Membership.status == "active", Membership.expires_at > now)
        .order_by(Membership.expires_at.desc())
    ).first()
    if latest:
        latest.expires_at = latest.expires_at + timedelta(days=days)
        return
    open_membership(db, driver_id, Decimal("0"), days)


def create_payment(db: Session, driver_id: UUID, method: str, reference: str | None, receipt_url: str | None):
    payment = MembershipPayment(
        driver_id=driver_id,
        amount=renewal_terms(db, driver_id)[0],
        payment_method=method,
        reference=reference,
        receipt_url=receipt_url,
        status="pending",
    )
    db.add(payment)
    db.flush()
    return payment
