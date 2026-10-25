"""Tarifas por tipo de vehículo: banderazo y costo por km, editables desde el panel de administración."""

import json
from decimal import Decimal

from app.config.settings import settings
from app.core.app_settings import AppSetting, save_setting
from sqlalchemy.orm import Session

TARIFFS = "tariffs"
KINDS = ("auto", "moto")


def tariffs(db: Session) -> dict[str, dict[str, Decimal]]:
    """Tarifas vigentes: las guardadas por el admin o, si no hay, las del entorno.

    Returns:
        Por tipo de vehículo, su banderazo (`base`) y su costo por kilómetro (`per_km`).
    """
    current = {
        "auto": {"base": settings.base_fare, "per_km": settings.per_km},
        "moto": {"base": settings.moto_base_fare, "per_km": settings.moto_per_km},
    }
    row = db.get(AppSetting, TARIFFS)
    if row:
        for kind, values in json.loads(row.value).items():
            if kind in current:
                current[kind] = {name: Decimal(amount) for name, amount in values.items()}
    return current


def set_tariffs(db: Session, values: dict[str, dict[str, Decimal]]) -> dict[str, dict[str, Decimal]]:
    """Guarda las tarifas de auto y moto que define el admin."""
    stored = {kind: {name: str(amount) for name, amount in values[kind].items()} for kind in KINDS}
    save_setting(db, TARIFFS, json.dumps(stored))
    return values


def fare(db: Session, service: str, distance_m: int) -> Decimal:
    """Tarifa mínima del viaje: banderazo más kilómetros por el costo del vehículo.

    Args:
        db: Sesión de base de datos.
        service: `auto`, `moto` o `paquete`; el paquete usa la tarifa de auto con su descuento.
        distance_m: Distancia de la ruta en metros.

    Returns:
        Monto en pesos con dos decimales.
    """
    tariff = tariffs(db)["moto" if service == "moto" else "auto"]
    amount = tariff["base"] + (Decimal(distance_m) / Decimal(1000)) * tariff["per_km"]
    if service == "paquete":
        amount *= settings.package_factor
    return amount.quantize(Decimal("0.01"))
