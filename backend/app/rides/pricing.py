"""Tarifas por tipo de vehículo: banderazo y costo por km, editables desde el panel de administración."""

import json
from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

from app.config.settings import settings
from app.core.app_settings import AppSetting, save_setting
from sqlalchemy.orm import Session

TARIFFS = "tariffs"
SURCHARGES = "surcharges"
KINDS = ("auto", "moto")
PACKAGE_SERVICES = ("paquete", "paquete_moto")
DEFAULT_SURCHARGES = {"bands": [], "special": {"active": False, "percent": 0, "label": "Tarifa especial"}}


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


def is_package(service: str) -> bool:
    """True para los envíos, en carro (`paquete`) o en moto (`paquete_moto`)."""
    return service in PACKAGE_SERVICES


def vehicle_of(service: str) -> str:
    """Vehículo que atiende el servicio: `moto` para viajes y envíos en moto, `auto` para el resto."""
    return "moto" if service in ("moto", "paquete_moto") else "auto"


def surcharges(db: Session) -> dict:
    """Recargos configurados: franjas horarias y la tarifa especial que el admin enciende a mano."""
    row = db.get(AppSetting, SURCHARGES)
    return json.loads(row.value) if row else json.loads(json.dumps(DEFAULT_SURCHARGES))


def set_surcharges(db: Session, values: dict) -> dict:
    """Guarda las franjas y la tarifa especial ya validadas."""
    save_setting(db, SURCHARGES, json.dumps(values))
    return values


def _minutes(clock: str) -> int:
    hours, minutes = clock.split(":")
    return int(hours) * 60 + int(minutes)


def current_surcharge(db: Session, at: datetime | None = None) -> tuple[int, str | None]:
    """Porcentaje de recargo vigente y su nombre, en la hora local de la zona.

    De las franjas que aplican se toma la mayor; la tarifa especial se suma encima.

    Returns:
        (porcentaje, nombre). (0, None) si no hay recargo.
    """
    local = (at or datetime.now(UTC)).astimezone(timezone(timedelta(hours=settings.zone_utc_offset_hours)))
    now = local.hour * 60 + local.minute
    config = surcharges(db)
    best = None
    for band in config["bands"]:
        start, end = _minutes(band["start"]), _minutes(band["end"])
        # Una franja como 22:00-06:00 cruza la medianoche.
        inside = start <= now < end if start < end else now >= start or now < end
        if inside and (best is None or band["percent"] > best["percent"]):
            best = band
    percent = best["percent"] if best else 0
    labels = [best["label"]] if best else []
    special = config["special"]
    if special["active"] and special["percent"] > 0:
        percent += special["percent"]
        labels.append(special["label"])
    return percent, " + ".join(labels) or None


def fare(db: Session, service: str, distance_m: int, surcharge_percent: int = 0) -> Decimal:
    """Tarifa mínima del viaje: banderazo más kilómetros por el costo del vehículo.

    Args:
        db: Sesión de base de datos.
        service: `auto`, `moto`, `paquete` o `paquete_moto`; un envío usa la tarifa de su vehículo
            con el descuento de paquete.
        distance_m: Distancia de la ruta en metros.
        surcharge_percent: Recargo por horario o tarifa especial, ya calculado.

    Returns:
        Monto en pesos con dos decimales.
    """
    tariff = tariffs(db)[vehicle_of(service)]
    amount = tariff["base"] + (Decimal(distance_m) / Decimal(1000)) * tariff["per_km"]
    if is_package(service):
        amount *= settings.package_factor
    amount *= 1 + Decimal(surcharge_percent) / 100
    return amount.quantize(Decimal("0.01"))
