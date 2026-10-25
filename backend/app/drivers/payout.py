"""Ajustes del conductor: código de seguridad, preferencias y datos para cobrar por transferencia."""

from app.core.errors import AppError
from app.drivers.amenities import AMENITIES, amenities_of
from app.rides.extras import valid_clabe
from app.rides.service import driver_for_user
from app.users.models import User
from sqlalchemy.orm import Session


def set_require_pin(db: Session, user: User, require_pin: bool) -> dict:
    """Activa o desactiva el código de 4 dígitos para los viajes que acepte desde ahora."""
    driver = driver_for_user(db, user)
    driver.require_pin = require_pin
    db.commit()
    return {"require_pin": driver.require_pin}


def save_amenities(db: Session, user: User, values: dict[str, bool]) -> dict[str, bool]:
    """Guarda lo que el conductor acepta u ofrece; la transferencia depende de su CLABE."""
    driver = driver_for_user(db, user)
    driver.amenities = {name: bool(values.get(name)) for name in AMENITIES}
    db.commit()
    return amenities_of(driver)


def get_payout(db: Session, user: User) -> dict | None:
    """CLABE, banco y titular guardados, o None si aún no los registra."""
    return driver_for_user(db, user).payout


def save_payout(db: Session, user: User, clabe: str, bank: str, holder: str) -> dict:
    """Guarda los datos de transferencia tras validar la CLABE.

    Args:
        db: Sesión de base de datos.
        user: Conductor con sesión.
        clabe: CLABE interbancaria de 18 dígitos.
        bank: Nombre del banco.
        holder: Titular de la cuenta.

    Returns:
        Los datos guardados.
    """
    if not valid_clabe(clabe):
        raise AppError(400, "Revisa la CLABE: el dígito de control no coincide")
    driver = driver_for_user(db, user)
    driver.payout = {"clabe": clabe, "bank": bank.strip(), "holder": holder.strip()}
    db.commit()
    return driver.payout
