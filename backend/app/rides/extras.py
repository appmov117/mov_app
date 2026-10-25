"""Extras del viaje: precio del pasajero, código de seguridad, paquetería y datos de pago."""

import hmac
import secrets
from decimal import ROUND_UP, Decimal

from app.core.errors import AppError
from app.core.rate_limit import hit
from app.drivers.models import Driver
from app.rides import pricing
from app.rides.models import Ride, RideRequest
from sqlalchemy.orm import Session

# El pasajero puede ofrecer hasta 20 % menos que la tarifa mínima; el conductor decide si acepta.
OFFER_FLOOR_RATIO = Decimal("0.80")
CLABE_WEIGHTS = (3, 7, 1)


def four_digits() -> str:
    """Código aleatorio de 4 dígitos para iniciar el viaje o entregar un paquete."""
    return f"{secrets.randbelow(10_000):04d}"


def offer_floor(minimum: Decimal) -> Decimal:
    """Lo menos que puede ofrecer el pasajero para una tarifa mínima dada."""
    return (minimum * OFFER_FLOOR_RATIO).quantize(Decimal("1"), rounding=ROUND_UP)


def price_request(db: Session, service: str, distance_m: int, offered: Decimal | None) -> dict:
    """Tarifa mínima con el recargo vigente y el precio con que se ofrece el viaje.

    Args:
        db: Sesión de base de datos.
        service: Servicio pedido.
        distance_m: Distancia de la ruta en metros.
        offered: Precio que propone el pasajero, o None para usar la tarifa mínima.

    Returns:
        ``min_fare``, ``fare`` (lo que ve el conductor), ``surcharge_percent`` y ``surcharge_label``.
    """
    percent, label = pricing.current_surcharge(db)
    minimum = pricing.fare(db, service, distance_m, percent)
    fare = minimum
    if offered is not None:
        fare = offered.quantize(Decimal("0.01"))
        floor = offer_floor(minimum)
        if fare < floor:
            raise AppError(400, f"Puedes ofrecer desde ${floor}")
    return {"min_fare": minimum, "fare": fare, "surcharge_percent": percent, "surcharge_label": label}


def check_start_pin(ride: Ride, pin: str | None) -> None:
    """Exige el código del pasajero si el conductor lo activó; limita los intentos."""
    if not ride.start_pin or ride.status != "driver_arrived":
        return
    hit(f"start-pin:{ride.id}", limit=5, window_seconds=600)
    if not pin or not hmac.compare_digest(pin.strip(), ride.start_pin):
        raise AppError(400, "El código no coincide. Pídeselo al pasajero.")


def check_delivery(ride: Ride, request: RideRequest | None, code: str | None) -> None:
    """Un paquete solo se entrega con foto y con el código de quien lo recibe."""
    if request is None or not pricing.is_package(request.service):
        return
    if not ride.delivery_photo_key:
        raise AppError(400, "Toma la foto de la entrega antes de finalizar")
    hit(f"delivery-code:{ride.id}", limit=5, window_seconds=600)
    if not code or not request.delivery_code or not hmac.compare_digest(code.strip(), request.delivery_code):
        raise AppError(400, "El código de entrega no coincide. Pídeselo a quien recibe.")


def valid_clabe(clabe: str) -> bool:
    """Verifica los 18 dígitos y el dígito de control de una CLABE."""
    if len(clabe) != 18 or not clabe.isdigit():
        return False
    total = sum((int(digit) * CLABE_WEIGHTS[index % 3]) % 10 for index, digit in enumerate(clabe[:17]))
    return (10 - total % 10) % 10 == int(clabe[17])


def passenger_extras(db: Session, ride: Ride) -> dict:
    """Lo que solo ve el pasajero: su código de seguridad, el de entrega y cómo pagar por transferencia."""
    request = db.get(RideRequest, ride.ride_request_id)
    driver = db.get(Driver, ride.driver_id)
    return {
        "start_pin": ride.start_pin if ride.status in {"accepted", "driver_arriving", "driver_arrived"} else None,
        "delivery_code": request.delivery_code if request else None,
        "driver_payout": driver.payout if driver and driver.payout else None,
    }


PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_PHOTO_BYTES = 8_000_000


def save_delivery_photo(db: Session, ride: Ride, content_type: str | None, content: bytes) -> None:
    """Guarda la foto con que el conductor comprueba la entrega del paquete."""
    from uuid import uuid4

    from app.core import storage

    request = db.get(RideRequest, ride.ride_request_id)
    if request is None or not pricing.is_package(request.service) or ride.status != "in_progress":
        raise AppError(409, "Solo se registra la foto al entregar un paquete")
    ext = PHOTO_TYPES.get((content_type or "").split(";")[0].strip().lower())
    if ext is None:
        raise AppError(400, "Sube una foto JPG, PNG o WebP")
    if not content or len(content) > MAX_PHOTO_BYTES:
        raise AppError(400, "La foto debe pesar menos de 8 MB")
    key = f"deliveries/{uuid4()}{ext}"
    storage.save(key, content, content_type or "application/octet-stream")
    ride.delivery_photo_key = key
    db.commit()


def load_delivery_photo(ride: Ride) -> tuple[bytes, str]:
    """Devuelve la foto de entrega y su tipo MIME."""
    from app.core import storage

    content = storage.load(ride.delivery_photo_key) if ride.delivery_photo_key else None
    if content is None:
        raise AppError(404, "Este viaje no tiene foto de entrega")
    mime = next(mime for mime, ext in PHOTO_TYPES.items() if ride.delivery_photo_key.endswith(ext))
    return content, mime
