from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

from app.complaints.models import Complaint
from app.core import storage
from app.core.errors import AppError
from app.core.support import money, track, utcnow
from app.drivers.models import Driver, DriverDocument, DriverSession
from app.memberships.service import require_active_membership
from app.rides import repository
from app.rides.models import Ride
from app.rides.service import driver_for_user
from app.users.models import User
from sqlalchemy import func, select
from sqlalchemy.orm import Session

DOC_KINDS = {"identity", "license", "plate", "vehicle_photo", "driver_photo"}


def update_profile(db: Session, user: User, name: str | None) -> dict:
    driver = driver_for_user(db, user)
    if name:
        user.name = name.strip()
        user.updated_at = utcnow()
    db.commit()
    return {
        "id": str(driver.id),
        "name": user.name,
        "driver_status": driver.driver_status,
        "verification_status": driver.verification_status,
        # Última ubicación guardada: respaldo para el mapa cuando el GPS del navegador no responde.
        "location": repository.driver_coords(db, driver.id),
        "rating": float(driver.rating),
        "completed_rides": driver.completed_rides,
        "cancelled_rides": driver.cancelled_rides,
    }


def profile(db: Session, user: User) -> dict:
    return update_profile(db, user, None)


def go_online(db: Session, user: User) -> dict:
    driver = driver_for_user(db, user)
    if driver.driver_status == "busy":
        raise AppError(409, "Termina el viaje antes de cambiar tu estado")
    require_active_membership(db, driver)
    driver.driver_status = "online"
    driver.paused_until = None
    open_session = db.scalar(
        select(DriverSession).where(DriverSession.driver_id == driver.id, DriverSession.ended_at.is_(None))
    )
    if open_session is None:
        db.add(DriverSession(driver_id=driver.id, started_at=utcnow()))
    track(db, user.id, "driver_online")
    db.commit()
    return {"driver_status": driver.driver_status}


def go_offline(db: Session, user: User) -> dict:
    driver = driver_for_user(db, user)
    if driver.driver_status == "busy":
        raise AppError(409, "Termina el viaje antes de desconectarte")
    driver.driver_status = "offline"
    driver.paused_until = None
    _close_session(db, driver.id)
    db.commit()
    return {"driver_status": driver.driver_status}


def pause(db: Session, user: User, minutes: int) -> dict:
    driver = driver_for_user(db, user)
    if driver.driver_status == "busy":
        raise AppError(409, "No puedes pausar durante un viaje")
    require_active_membership(db, driver)
    driver.driver_status = "paused"
    driver.paused_until = utcnow() + timedelta(minutes=minutes)
    db.commit()
    return {"driver_status": driver.driver_status, "paused_until": driver.paused_until.isoformat()}


def _close_session(db: Session, driver_id: UUID) -> None:
    open_session = db.scalar(
        select(DriverSession).where(DriverSession.driver_id == driver_id, DriverSession.ended_at.is_(None))
    )
    if open_session:
        open_session.ended_at = utcnow()


def _block(db: Session, driver: Driver, start) -> dict:
    rides = db.scalars(
        select(Ride).where(
            Ride.driver_id == driver.id,
            Ride.status == "completed",
            Ride.completed_at.is_not(None),
            Ride.completed_at >= start,
        )
    ).all()
    total = sum((ride.fare_amount or 0) for ride in rides)
    count = len(rides)
    distance = sum(ride.distance_m or 0 for ride in rides)
    sessions = db.scalars(
        select(DriverSession).where(DriverSession.driver_id == driver.id, DriverSession.started_at >= start)
    ).all()
    seconds = 0
    now = utcnow()
    for session in sessions:
        end = session.ended_at or now
        seconds += max(int((end - session.started_at).total_seconds()), 0)
    return {
        "rides": count,
        "declared_amount": float(total),
        "average_fare": float(total / count) if count else 0,
        "connected_seconds": seconds,
        "distance_m": distance,
    }


def statistics(db: Session, user: User) -> dict:
    driver = driver_for_user(db, user)
    now = utcnow()
    open_complaints = db.scalar(
        select(func.count()).select_from(Complaint).where(
            Complaint.driver_id == driver.id, Complaint.status.in_(["open", "reviewing"])
        )
    )
    return {
        "rating": float(driver.rating),
        "complaints_open": int(open_complaints or 0),
        "today": _block(db, driver, now.replace(hour=0, minute=0, second=0, microsecond=0)),
        "week": _block(db, driver, now - timedelta(days=7)),
        "month": _block(db, driver, now - timedelta(days=30)),
    }


def ratings_received(db: Session, user: User) -> list[dict]:
    from app.ratings.models import Rating

    driver = driver_for_user(db, user)
    rows = db.scalars(
        select(Rating)
        .where(Rating.driver_id == driver.id, Rating.author_role == "passenger")
        .order_by(Rating.created_at.desc())
    ).all()
    return [
        {
            "ride_id": str(row.ride_id),
            "rating": row.rating,
            "comment": row.comment,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


def complaints_received(db: Session, user: User) -> list[dict]:
    driver = driver_for_user(db, user)
    rows = db.scalars(
        select(Complaint).where(Complaint.driver_id == driver.id).order_by(Complaint.created_at.desc())
    ).all()
    return [
        {
            "id": str(row.id),
            "ride_id": str(row.ride_id),
            "category": row.category,
            "description": row.description,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


def save_document(db: Session, user: User, kind: str, filename: str | None, content: bytes) -> dict:
    if kind not in DOC_KINDS:
        raise AppError(400, "Ese documento no es válido")
    driver = driver_for_user(db, user)
    ext = Path(filename or "").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        raise AppError(400, "Sube una imagen o un PDF")
    if len(content) > 8_000_000:
        raise AppError(400, "El archivo supera 8 MB")
    key = f"documents/{uuid4()}{ext}"
    storage.save(key, content)
    row = DriverDocument(driver_id=driver.id, kind=kind, file_url=key, status="pending")
    db.add(row)
    db.commit()
    return {"id": str(row.id), "kind": kind, "status": row.status}


def list_documents(db: Session, user: User) -> list[dict]:
    driver = driver_for_user(db, user)
    rows = db.scalars(
        select(DriverDocument).where(DriverDocument.driver_id == driver.id).order_by(DriverDocument.created_at)
    ).all()
    return [
        {"id": str(row.id), "kind": row.kind, "status": row.status, "note": row.note, "file_url": row.file_url}
        for row in rows
    ]


def declared_total(db: Session, driver_id: UUID):
    total = db.scalar(
        select(func.coalesce(func.sum(Ride.fare_amount), 0)).where(
            Ride.driver_id == driver_id, Ride.status == "completed"
        )
    )
    return money(total) or 0
