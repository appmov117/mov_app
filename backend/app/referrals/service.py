import secrets
from datetime import UTC, datetime
from uuid import UUID

from app.config.settings import settings
from app.core.deps import month_start
from app.core.support import utcnow
from app.drivers.models import Driver
from app.memberships.service import add_bonus_days
from app.referrals.models import DriverReward, Referral, ReferralCode
from app.users.models import User
from sqlalchemy import func, select
from sqlalchemy.orm import Session

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        exists = db.scalar(select(ReferralCode.driver_id).where(ReferralCode.code == code))
        if exists is None:
            return code
    return secrets.token_hex(4).upper()


def ensure_code(db: Session, driver_id: UUID) -> ReferralCode:
    current = db.get(ReferralCode, driver_id)
    if current:
        return current
    row = ReferralCode(driver_id=driver_id, code=new_code(db))
    db.add(row)
    db.flush()
    return row


def attach_referral(db: Session, code: str | None, referred_user_id: UUID) -> None:
    if not code:
        return
    owner = db.scalar(select(ReferralCode).where(ReferralCode.code == code.strip().upper()))
    if owner is None:
        return
    driver = db.get(Driver, owner.driver_id)
    if driver is None or driver.user_id == referred_user_id:
        return
    db.add(
        Referral(
            driver_id=owner.driver_id,
            referred_user_id=referred_user_id,
            referral_code=owner.code,
        )
    )


def _rewarded_days_this_month(db: Session, driver_id: UUID) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(DriverReward.days), 0)).where(
            DriverReward.driver_id == driver_id,
            DriverReward.created_at >= month_start(),
        )
    )
    return int(total or 0)


def apply_bonus(db: Session, driver_id: UUID, key: str, days: int) -> int:
    exists = db.scalar(
        select(DriverReward.id).where(DriverReward.driver_id == driver_id, DriverReward.reward_key == key)
    )
    if exists:
        return 0
    room = settings.monthly_reward_cap_days - _rewarded_days_this_month(db, driver_id)
    grant = min(days, room)
    if grant <= 0:
        return 0
    add_bonus_days(db, driver_id, grant)
    db.add(DriverReward(driver_id=driver_id, reward_key=key, days=grant))
    return grant


def on_passenger_ride_completed(db: Session, passenger_user_id: UUID) -> None:
    referral = db.scalar(select(Referral).where(Referral.referred_user_id == passenger_user_id))
    if referral is None or referral.first_completed_ride_at is not None:
        return
    user = db.get(User, passenger_user_id)
    if user is None or user.role != "passenger":
        return
    referral.first_completed_ride_at = utcnow()
    qualified = db.scalar(
        select(func.count())
        .select_from(Referral)
        .join(User, User.id == Referral.referred_user_id)
        .where(
            Referral.driver_id == referral.driver_id,
            User.role == "passenger",
            Referral.first_completed_ride_at.is_not(None),
            Referral.first_completed_ride_at >= month_start(),
        )
    )
    month_key = datetime.now(UTC).strftime("%Y-%m")
    awarded = False
    if qualified >= 3:
        awarded = apply_bonus(db, referral.driver_id, f"{month_key}:pax3", 7) > 0 or awarded
    if qualified >= 10:
        awarded = apply_bonus(db, referral.driver_id, f"{month_key}:pax10", 30) > 0 or awarded
    if awarded:
        rows = db.scalars(
            select(Referral)
            .join(User, User.id == Referral.referred_user_id)
            .where(
                Referral.driver_id == referral.driver_id,
                User.role == "passenger",
                Referral.first_completed_ride_at.is_not(None),
                Referral.first_completed_ride_at >= month_start(),
            )
        ).all()
        for row in rows:
            row.reward_applied = True


def on_driver_membership_paid(db: Session, driver: Driver) -> None:
    referral = db.scalar(select(Referral).where(Referral.referred_user_id == driver.user_id))
    if referral is None or referral.reward_applied:
        return
    apply_bonus(db, referral.driver_id, f"driver-paid:{driver.user_id}", 15)
    referral.reward_applied = True


def summary(db: Session, driver: Driver) -> dict:
    code = ensure_code(db, driver.id)
    active_passengers = db.scalar(
        select(func.count())
        .select_from(Referral)
        .join(User, User.id == Referral.referred_user_id)
        .where(
            Referral.driver_id == driver.id,
            User.role == "passenger",
            Referral.first_completed_ride_at.is_not(None),
        )
    )
    reward_days = db.scalar(
        select(func.coalesce(func.sum(DriverReward.days), 0)).where(DriverReward.driver_id == driver.id)
    )
    # Las recompensas por pasajeros se cuentan por mes: este es el avance que ve el conductor.
    month_passengers = db.scalar(
        select(func.count())
        .select_from(Referral)
        .join(User, User.id == Referral.referred_user_id)
        .where(
            Referral.driver_id == driver.id,
            User.role == "passenger",
            Referral.first_completed_ride_at >= month_start(),
        )
    )
    return {
        "code": code.code,
        "url": f"{settings.public_app_url}/r/{code.code}",
        "active_passengers": int(active_passengers or 0),
        "month_passengers": int(month_passengers or 0),
        "reward_days": int(reward_days or 0),
        "monthly_cap_days": settings.monthly_reward_cap_days,
    }


def list_referrals(db: Session, driver: Driver) -> list[dict]:
    rows = db.execute(
        select(Referral, User)
        .join(User, User.id == Referral.referred_user_id)
        .where(Referral.driver_id == driver.id)
        .order_by(Referral.created_at.desc())
    ).all()
    return [
        {
            "id": str(referral.id),
            "name": user.name,
            "role": user.role,
            "qualified": referral.first_completed_ride_at is not None or referral.reward_applied,
            "created_at": referral.created_at.isoformat() if referral.created_at else None,
        }
        for referral, user in rows
    ]
