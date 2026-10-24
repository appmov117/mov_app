from tempfile import SpooledTemporaryFile
from typing import BinaryIO
from uuid import UUID, uuid4

from app.core import storage
from app.core.errors import AppError
from app.core.support import audit, read_point, track, utcnow
from app.drivers.models import Driver
from app.notifications.service import notify
from app.passengers.models import Passenger
from app.rides.models import Ride
from app.rides.service import passenger_for_user
from app.safety.models import SafetyAlert, SafetyRecording
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import select, text
from sqlalchemy.orm import Session

RECORDINGS = "recordings"
CHUNK = 1024 * 1024
# El plan gratis de Supabase Storage acepta archivos de hasta 50 MB.
MAX_BYTES = {"audio": 30_000_000, "video": 50_000_000}
EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/mpeg": ".mp3",
    "video/webm": ".webm",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}


def _own_ride(db: Session, user: User, ride_id: UUID) -> tuple[Ride, Passenger]:
    passenger = passenger_for_user(db, user)
    ride = db.get(Ride, ride_id)
    if ride is None or ride.passenger_id != passenger.id:
        raise AppError(404, "No encontramos el viaje")
    return ride, passenger


def create_alert(
    db: Session, user: User, ride_id: UUID, latitude: float | None, longitude: float | None
) -> dict:
    """Registra una alerta de pánico y avisa a todos los administradores.

    Args:
        db: Sesión de base de datos.
        user: Pasajero que pide ayuda.
        ride_id: Viaje en curso del pasajero.
        latitude: Latitud actual del pasajero, si el navegador la dio.
        longitude: Longitud actual del pasajero, si el navegador la dio. Sin coordenadas,
            se usa la última ubicación conocida del conductor del viaje.

    Returns:
        La alerta creada.
    """
    ride, passenger = _own_ride(db, user, ride_id)
    row = SafetyAlert(
        ride_id=ride.id, passenger_id=passenger.id, driver_id=ride.driver_id, status="open"
    )
    db.add(row)
    db.flush()
    if latitude is not None and longitude is not None:
        db.execute(
            text(
                """
                UPDATE safety_alerts
                SET location = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                WHERE id = :id
                """
            ),
            {"lat": latitude, "lng": longitude, "id": row.id},
        )
    elif ride.driver_id is not None:
        db.execute(
            text(
                """
                UPDATE safety_alerts
                SET location = (SELECT location FROM driver_locations WHERE driver_id = :driver)
                WHERE id = :id
                """
            ),
            {"driver": ride.driver_id, "id": row.id},
        )
    audit(db, user.id, "safety_alert_created", {"ride_id": str(ride.id)})
    track(db, user.id, "safety_alert_created")
    for admin_id in db.scalars(
        select(User.id).where(User.role == "admin", User.status == "active")
    ):
        notify(
            db,
            admin_id,
            "Alerta de pánico",
            f"{user.name} pidió ayuda durante un viaje",
            {"alert_id": str(row.id)},
        )
    db.commit()
    return _present_alert(db, row)


def save_recording(
    db: Session,
    user: User,
    ride_id: UUID,
    kind: str,
    session_id: UUID,
    segment: int,
    content_type: str | None,
    stream: BinaryIO,
) -> dict:
    """Guarda en disco un segmento de grabación, validando tipo y tamaño.

    Args:
        db: Sesión de base de datos.
        user: Pasajero que graba.
        ride_id: Viaje al que pertenece la grabación.
        kind: ``audio`` o ``video``.
        session_id: Identificador de la grabación a la que pertenece el segmento.
        segment: Número de segmento dentro de la grabación.
        content_type: Tipo MIME declarado por el navegador.
        stream: Contenido del archivo.

    Returns:
        El segmento guardado.
    """
    if kind not in MAX_BYTES:
        raise AppError(400, "Tipo de grabación no válido")
    mime = (content_type or "").split(";")[0].strip().lower()
    ext = EXTENSIONS.get(mime)
    if ext is None or not mime.startswith(f"{kind}/"):
        raise AppError(400, "Formato de grabación no soportado")
    ride, passenger = _own_ride(db, user, ride_id)
    key = f"{RECORDINGS}/{uuid4()}{ext}"
    size = 0
    with SpooledTemporaryFile(max_size=CHUNK * 8) as buffer:
        while chunk := stream.read(CHUNK):
            size += len(chunk)
            if size > MAX_BYTES[kind]:
                raise AppError(413, "La grabación es demasiado grande")
            buffer.write(chunk)
        if size == 0:
            raise AppError(400, "La grabación está vacía")
        buffer.seek(0)
        storage.save(key, buffer, mime)
    row = SafetyRecording(
        ride_id=ride.id,
        passenger_id=passenger.id,
        session_id=session_id,
        segment=segment,
        kind=kind,
        file_url=key,
        mime_type=mime,
        size_bytes=size,
    )
    db.add(row)
    audit(
        db,
        user.id,
        "safety_recording_saved",
        {"ride_id": str(ride.id), "kind": kind, "segment": segment},
    )
    db.commit()
    return _present_recording(row)


def list_alerts(db: Session) -> list[dict]:
    rows = db.scalars(
        select(SafetyAlert).order_by(SafetyAlert.status, SafetyAlert.created_at.desc()).limit(100)
    ).all()
    return [_present_alert(db, row) for row in rows]


def attend_alert(db: Session, admin: User, alert_id: UUID) -> dict:
    row = db.get(SafetyAlert, alert_id)
    if row is None:
        raise AppError(404, "No encontramos la alerta")
    row.status = "attended"
    row.attended_at = utcnow()
    row.attended_by = admin.id
    audit(db, admin.id, "safety_alert_attended", {"alert_id": str(row.id)})
    db.commit()
    return _present_alert(db, row)


def list_recordings(db: Session) -> list[dict]:
    rows = db.scalars(
        select(SafetyRecording).order_by(SafetyRecording.created_at.desc()).limit(200)
    ).all()
    return [{**_present_recording(row), **_people(db, row.ride_id)} for row in rows]


def recording_file(db: Session, recording_id: UUID) -> tuple[bytes, str]:
    row = db.get(SafetyRecording, recording_id)
    if row is None:
        raise AppError(404, "No encontramos la grabación")
    content = storage.load(row.file_url)
    if content is None:
        raise AppError(404, "El archivo ya no existe")
    return content, row.mime_type


def _people(db: Session, ride_id: UUID) -> dict:
    ride = db.get(Ride, ride_id)
    passenger = db.get(Passenger, ride.passenger_id) if ride else None
    passenger_user = db.get(User, passenger.user_id) if passenger else None
    driver = db.get(Driver, ride.driver_id) if ride and ride.driver_id else None
    driver_user = db.get(User, driver.user_id) if driver else None
    vehicle = (
        db.scalar(select(Vehicle).where(Vehicle.driver_id == driver.id, Vehicle.active.is_(True)))
        if driver
        else None
    )
    return {
        "passenger": {"name": passenger_user.name, "phone": passenger_user.phone}
        if passenger_user
        else None,
        "driver": {"name": driver_user.name, "phone": driver_user.phone} if driver_user else None,
        "plate": vehicle.plate if vehicle else None,
    }


def _present_alert(db: Session, row: SafetyAlert) -> dict:
    return {
        "id": str(row.id),
        "ride_id": str(row.ride_id),
        "status": row.status,
        "location": read_point(db, "safety_alerts", "id", row.id, "location"),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "attended_at": row.attended_at.isoformat() if row.attended_at else None,
        **_people(db, row.ride_id),
    }


def _present_recording(row: SafetyRecording) -> dict:
    return {
        "id": str(row.id),
        "ride_id": str(row.ride_id),
        "session_id": str(row.session_id),
        "segment": row.segment,
        "kind": row.kind,
        "mime_type": row.mime_type,
        "size_bytes": row.size_bytes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
