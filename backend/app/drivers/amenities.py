"""Preferencias que el pasajero ve en el perfil del conductor, como iconos en verde o rojo."""

from app.drivers.models import Driver

AMENITIES = ("pets", "ac", "luggage", "card")


def amenities_of(driver: Driver) -> dict[str, bool]:
    """Mascotas, aire, equipaje grande y tarjeta según el conductor; transferencia si tiene CLABE.

    Las que no ha marcado cuentan como no.
    """
    saved = driver.amenities or {}
    return {name: bool(saved.get(name)) for name in AMENITIES} | {"transfer": bool(driver.payout)}
