from datetime import timedelta

from app.auth.models import RefreshToken
from app.config.settings import settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    verify_password,
)
from app.core.support import audit, track, utcnow
from app.drivers.models import Driver
from app.drivers.onboarding import welcome
from app.passengers.models import Passenger
from app.referrals.service import attach_referral, ensure_code
from app.users.avatar import avatar_url
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import or_, select
from sqlalchemy.orm import Session


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 10:
        raise AppError(400, "El teléfono debe tener al menos 10 dígitos")
    return digits


def normalize_email(email: str | None) -> str | None:
    if email is None or not email.strip():
        return None
    cleaned = email.strip().lower()
    if "@" not in cleaned:
        raise AppError(400, "El correo no es válido")
    return cleaned


def _tokens(db: Session, user: User) -> dict:
    refresh = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        )
    )
    db.commit()
    return {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": refresh,
        "token_type": "bearer",
    }


def public_user(db: Session, user: User) -> dict:
    payload = {
        "id": str(user.id),
        "name": user.name,
        "phone": user.phone,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "avatar_url": avatar_url(user),
    }
    if user.role == "driver":
        driver = db.scalar(select(Driver).where(Driver.user_id == user.id))
        payload["driver_id"] = str(driver.id) if driver else None
        payload["verification_status"] = driver.verification_status if driver else None
        payload["driver_status"] = driver.driver_status if driver else None
    if user.role == "passenger":
        passenger = db.scalar(select(Passenger).where(Passenger.user_id == user.id))
        payload["passenger_id"] = str(passenger.id) if passenger else None
    return payload


def register(db: Session, data, *, allow_admin: bool = False) -> dict:
    if data.role == "admin" and not allow_admin:
        raise AppError(403, "No puedes registrarte como administrador")
    phone = normalize_phone(data.phone)
    email = normalize_email(data.email)
    if db.scalar(select(User).where(User.phone == phone)):
        raise AppError(409, "Ese teléfono ya está registrado")
    if email and db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "Ese correo ya está registrado")
    if data.role == "driver" and data.vehicle is None:
        raise AppError(400, "Registra los datos del vehículo")
    user = User(
        name=data.name.strip(),
        phone=phone,
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
        status="active",
    )
    db.add(user)
    db.flush()
    if data.role == "passenger":
        db.add(Passenger(user_id=user.id))
        track(db, user.id, "passenger_registered")
    elif data.role == "driver":
        driver = Driver(user_id=user.id, driver_status="offline", verification_status="pending")
        db.add(driver)
        db.flush()
        plate = data.vehicle.plate.strip().upper()
        if db.scalar(select(Vehicle).where(Vehicle.plate == plate)):
            raise AppError(409, "Esa placa ya está registrada")
        db.add(
            Vehicle(
                driver_id=driver.id,
                brand=data.vehicle.brand.strip(),
                model=data.vehicle.model.strip(),
                year=data.vehicle.year,
                color=data.vehicle.color.strip(),
                plate=plate,
                kind=data.vehicle.kind,
                active=True,
            )
        )
        welcome(db, driver)
        ensure_code(db, driver.id)
        track(db, user.id, "driver_registered")
    attach_referral(db, data.referral_code, user.id)
    return _tokens(db, user)


def login(db: Session, identifier: str, password: str) -> dict:
    ident = identifier.strip()
    phone = "".join(ch for ch in ident if ch.isdigit()) if "@" not in ident else None
    user = db.scalar(
        select(User).where(or_(User.email == ident.lower(), User.phone == phone) if phone else User.email == ident.lower())
    )
    if user is None or not verify_password(password, user.password_hash):
        raise AppError(401, "Teléfono o contraseña incorrectos")
    if user.status == "suspended":
        raise AppError(403, "Tu cuenta está suspendida")
    if user.status == "blocked":
        raise AppError(403, "Tu cuenta está bloqueada")
    audit(db, user.id, "login")
    return _tokens(db, user)


def refresh(db: Session, refresh_token: str) -> dict:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token)))
    if row is None or row.revoked_at is not None or row.expires_at <= utcnow():
        raise AppError(401, "La sesión expiró. Entra de nuevo")
    row.revoked_at = utcnow()
    user = db.get(User, row.user_id)
    if user is None or user.status != "active":
        raise AppError(401, "La sesión expiró. Entra de nuevo")
    return _tokens(db, user)


def logout(db: Session, refresh_token: str) -> None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token)))
    if row and row.revoked_at is None:
        row.revoked_at = utcnow()
        db.commit()
