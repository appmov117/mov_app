from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from app.config.settings import settings
from app.core.errors import AppError
from app.core.support import days_remaining, utcnow
from app.drivers.models import Driver
from app.memberships.models import Membership, MembershipPayment
from sqlalchemy import select
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


def membership_view(db: Session, driver_id: UUID) -> dict:
    current = active_membership(db, driver_id)
    latest = latest_membership(db, driver_id)
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
        "price": float(settings.membership_price),
        "days": settings.membership_days,
        "payment_url": settings.membership_payment_url,
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
        amount=settings.membership_price,
        payment_method=method,
        reference=reference,
        receipt_url=receipt_url,
        status="pending",
    )
    db.add(payment)
    db.flush()
    return payment
