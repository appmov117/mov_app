from datetime import timedelta
from uuid import UUID

from app.complaints.models import Complaint
from app.core.errors import AppError
from app.core.support import audit, money, track, utcnow
from app.drivers.models import Driver
from app.memberships.models import Membership, MembershipPayment
from app.memberships.service import open_membership
from app.notifications.service import notify
from app.passengers.models import Passenger
from app.referrals.models import Referral
from app.referrals.service import on_driver_membership_paid
from app.rides.models import Ride, RideOffer, RideRequest
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session


def dashboard(db: Session) -> dict:
    now = utcnow()
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week = now - timedelta(days=7)

    def count(stmt) -> int:
        return int(db.scalar(stmt) or 0)

    drivers_total = count(select(func.count()).select_from(Driver))
    drivers_approved = count(
        select(func.count()).select_from(Driver).where(Driver.verification_status == "approved")
    )
    drivers_online = count(select(func.count()).select_from(Driver).where(Driver.driver_status == "online"))
    memberships_active = count(
        select(func.count()).select_from(Membership).where(
            Membership.status == "active", Membership.starts_at <= now, Membership.expires_at > now
        )
    )
    active_passenger_ids = db.scalars(
        select(Ride.passenger_id).where(Ride.status == "completed", Ride.completed_at >= week).distinct()
    ).all()
    requests_today = count(
        select(func.count()).select_from(RideRequest).where(RideRequest.created_at >= start_today)
    )
    completed_today = count(
        select(func.count()).select_from(Ride).where(Ride.status == "completed", Ride.completed_at >= start_today)
    )
    offers_closed = count(
        select(func.count()).select_from(RideOffer).where(RideOffer.status.in_(["accepted", "rejected", "expired"]))
    )
    offers_accepted = count(select(func.count()).select_from(RideOffer).where(RideOffer.status == "accepted"))
    rides_total = count(select(func.count()).select_from(Ride))
    rides_cancelled = count(select(func.count()).select_from(Ride).where(Ride.status == "cancelled"))
    rides_completed = count(select(func.count()).select_from(Ride).where(Ride.status == "completed"))
    revenue = db.scalar(
        select(func.coalesce(func.sum(MembershipPayment.amount), 0)).where(MembershipPayment.status == "approved")
    )
    declared = db.scalar(
        select(func.coalesce(func.sum(Ride.fare_amount), 0)).where(Ride.status == "completed")
    )
    complaints_open = count(
        select(func.count()).select_from(Complaint).where(Complaint.status.in_(["open", "reviewing"]))
    )
    week_completed = count(
        select(func.count()).select_from(Ride).where(Ride.status == "completed", Ride.completed_at >= week)
    )
    week_drivers = count(
        select(func.count(func.distinct(Ride.driver_id))).select_from(Ride).where(
            Ride.status == "completed", Ride.completed_at >= week
        )
    )
    expired_rows = db.scalars(select(Membership).where(Membership.expires_at <= now)).all()
    renewed = 0
    for membership in expired_rows:
        later = db.scalar(
            select(func.count()).select_from(Membership).where(
                Membership.driver_id == membership.driver_id,
                Membership.id != membership.id,
                Membership.starts_at >= membership.expires_at,
                Membership.status != "cancelled",
                Membership.amount > 0,
            )
        )
        if later:
            renewed += 1
    accept_seconds = db.execute(
        text(
            """
            SELECT AVG(EXTRACT(EPOCH FROM (r.created_at - q.created_at)))
            FROM rides r
            JOIN ride_requests q ON q.id = r.ride_request_id
            """
        )
    ).scalar()
    pickup_seconds = db.execute(
        text(
            """
            SELECT AVG(EXTRACT(EPOCH FROM (e.created_at - r.created_at)))
            FROM ride_events e
            JOIN rides r ON r.id = e.ride_id
            WHERE e.event_type = 'driver_arrived'
            """
        )
    ).scalar()
    return {
        "drivers_registered": drivers_total,
        "drivers_approved": drivers_approved,
        "drivers_online": drivers_online,
        "memberships_active": memberships_active,
        "passengers_registered": count(select(func.count()).select_from(Passenger)),
        "passengers_active_week": len(set(active_passenger_ids)),
        "requests_today": requests_today,
        "rides_completed_today": completed_today,
        "acceptance_rate": (offers_accepted / offers_closed) if offers_closed else None,
        "completion_rate": (rides_completed / rides_total) if rides_total else None,
        "cancellation_rate": (rides_cancelled / rides_total) if rides_total else None,
        "membership_revenue": money(revenue) or 0,
        "declared_ride_volume": money(declared) or 0,
        "complaints_open": complaints_open,
        "rides_per_active_driver_week": (week_completed / week_drivers) if week_drivers else None,
        "renewal_rate": (renewed / len(expired_rows)) if expired_rows else None,
        "expired_memberships": len(expired_rows),
        "renewed_memberships": renewed,
        "avg_seconds_to_accept": float(accept_seconds) if accept_seconds is not None else None,
        "avg_seconds_to_pickup": float(pickup_seconds) if pickup_seconds is not None else None,
    }


def list_drivers(db: Session) -> list[dict]:
    rows = db.execute(select(Driver, User).join(User, User.id == Driver.user_id).order_by(Driver.created_at.desc())).all()
    result = []
    for driver, user in rows:
        from app.memberships.service import membership_view

        result.append(
            {
                "id": str(driver.id),
                "name": user.name,
                "phone": user.phone,
                "email": user.email,
                "status": user.status,
                "driver_status": driver.driver_status,
                "verification_status": driver.verification_status,
                "rating": float(driver.rating),
                "completed_rides": driver.completed_rides,
                "cancelled_rides": driver.cancelled_rides,
                "membership": membership_view(db, driver.id),
            }
        )
    return result


def driver_detail(db: Session, driver_id: UUID) -> dict:
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise AppError(404, "No encontramos al conductor")
    user = db.get(User, driver.user_id)
    rides = db.scalars(select(Ride).where(Ride.driver_id == driver.id).order_by(Ride.created_at.desc()).limit(40)).all()
    memberships = db.scalars(
        select(Membership).where(Membership.driver_id == driver.id).order_by(Membership.created_at.desc())
    ).all()
    payments = db.scalars(
        select(MembershipPayment).where(MembershipPayment.driver_id == driver.id).order_by(MembershipPayment.created_at.desc())
    ).all()
    complaints = db.scalars(select(Complaint).where(Complaint.driver_id == driver.id)).all()
    referrals = db.scalars(select(Referral).where(Referral.driver_id == driver.id)).all()
    vehicle = db.scalar(select(Vehicle).where(Vehicle.driver_id == driver.id, Vehicle.active.is_(True)))
    return {
        "id": str(driver.id),
        "name": user.name if user else "",
        "phone": user.phone if user else "",
        "email": user.email if user else None,
        "status": user.status if user else None,
        "verification_status": driver.verification_status,
        "driver_status": driver.driver_status,
        "rating": float(driver.rating),
        "vehicle": None
        if vehicle is None
        else {"brand": vehicle.brand, "model": vehicle.model, "plate": vehicle.plate, "color": vehicle.color},
        "rides": [
            {
                "id": str(ride.id),
                "status": ride.status,
                "fare_amount": money(ride.fare_amount),
                "created_at": ride.created_at.isoformat() if ride.created_at else None,
            }
            for ride in rides
        ],
        "memberships": [
            {
                "id": str(item.id),
                "status": item.status,
                "amount": money(item.amount),
                "starts_at": item.starts_at.isoformat(),
                "expires_at": item.expires_at.isoformat(),
            }
            for item in memberships
        ],
        "payments": [
            {
                "id": str(item.id),
                "status": item.status,
                "amount": money(item.amount),
                "payment_method": item.payment_method,
                "receipt_url": item.receipt_url,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in payments
        ],
        "complaints": [
            {"id": str(item.id), "category": item.category, "status": item.status} for item in complaints
        ],
        "referrals": len(list(referrals)),
        "cancelled_rides": driver.cancelled_rides,
    }


def set_driver_access(db: Session, driver_id: UUID, *, active: bool, admin: User) -> dict:
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise AppError(404, "No encontramos al conductor")
    user = db.get(User, driver.user_id)
    if active:
        driver.verification_status = "approved"
        if user and user.status == "suspended":
            user.status = "active"
    else:
        if user:
            user.status = "suspended"
        driver.driver_status = "offline"
        audit(db, admin.id, "driver_suspended", {"driver_id": str(driver.id)})
    db.commit()
    return {"id": str(driver.id), "verification_status": driver.verification_status, "status": user.status if user else None}


def list_passengers(db: Session) -> list[dict]:
    rows = db.execute(select(Passenger, User).join(User, User.id == Passenger.user_id)).all()
    return [
        {
            "id": str(passenger.id),
            "name": user.name,
            "phone": user.phone,
            "status": user.status,
            "total_rides": passenger.total_rides,
        }
        for passenger, user in rows
    ]


def list_payments(db: Session) -> list[dict]:
    rows = db.execute(
        select(MembershipPayment, User)
        .join(Driver, Driver.id == MembershipPayment.driver_id)
        .join(User, User.id == Driver.user_id)
        .order_by(MembershipPayment.created_at.desc())
    ).all()
    return [
        {
            "id": str(payment.id),
            "driver_name": user.name,
            "driver_id": str(payment.driver_id),
            "amount": money(payment.amount),
            "payment_method": payment.payment_method,
            "status": payment.status,
            "reference": payment.reference,
            "receipt_url": payment.receipt_url,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
        }
        for payment, user in rows
    ]


def approve_payment(db: Session, payment_id: UUID, admin: User) -> dict:
    payment = db.get(MembershipPayment, payment_id)
    if payment is None:
        raise AppError(404, "No encontramos el pago")
    if payment.status != "pending":
        raise AppError(409, "Este pago ya fue revisado")
    driver = db.get(Driver, payment.driver_id)
    had_membership = db.scalar(
        select(func.count()).select_from(Membership).where(Membership.driver_id == payment.driver_id, Membership.amount > 0)
    )
    membership = open_membership(db, payment.driver_id, payment.amount)
    payment.status = "approved"
    payment.membership_id = membership.id
    payment.reviewed_at = utcnow()
    if driver:
        on_driver_membership_paid(db, driver)
        event = "membership_renewed" if had_membership else "membership_paid"
        track(db, driver.user_id, event, {"payment_id": str(payment.id)})
    audit(db, admin.id, "membership_approved", {"payment_id": str(payment.id)})
    if driver:
        notify(db, driver.user_id, "Membresía activada", "Tu pago fue aprobado. Ya puedes recibir viajes.", None)
    db.commit()
    return {"id": str(payment.id), "status": payment.status}


def reject_payment(db: Session, payment_id: UUID) -> dict:
    payment = db.get(MembershipPayment, payment_id)
    if payment is None:
        raise AppError(404, "No encontramos el pago")
    if payment.status != "pending":
        raise AppError(409, "Este pago ya fue revisado")
    payment.status = "rejected"
    payment.reviewed_at = utcnow()
    driver = db.get(Driver, payment.driver_id)
    if driver:
        notify(db, driver.user_id, "Pago no aprobado", "Revisa tu comprobante y vuelve a enviarlo.", None)
    db.commit()
    return {"id": str(payment.id), "status": payment.status}
