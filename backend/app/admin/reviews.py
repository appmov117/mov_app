"""Revisión desde el panel: documentos de conductores y quejas de ambas partes."""

from uuid import UUID

from app.admin.people import drivers_by_id, passengers_by_id
from app.complaints.models import Complaint
from app.core.errors import AppError
from app.core.support import audit, utcnow
from app.drivers.models import Driver, DriverDocument
from app.notifications.service import notify
from app.users.models import User
from sqlalchemy import select, text
from sqlalchemy.orm import Session

DOCUMENT_LABELS = {
    "identity": "Identificación oficial",
    "license": "Licencia de conducir",
    "plate": "Tarjeta de circulación",
    "vehicle_photo": "Foto del vehículo",
    "driver_photo": "Foto del conductor",
}


def _document(row: DriverDocument, people: dict) -> dict:
    return {
        "id": str(row.id),
        "kind": row.kind,
        "label": DOCUMENT_LABELS.get(row.kind, row.kind),
        "status": row.status,
        "note": row.note,
        "file_url": row.file_url,
        "driver": people.get(row.driver_id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
    }


def list_documents(db: Session, status: str | None = None, driver_id: UUID | None = None) -> list[dict]:
    """Documentos subidos por los conductores, los pendientes primero."""
    query = select(DriverDocument).order_by(DriverDocument.created_at.desc())
    if status:
        query = query.where(DriverDocument.status == status)
    if driver_id:
        query = query.where(DriverDocument.driver_id == driver_id)
    rows = db.scalars(query).all()
    people = drivers_by_id(db, [row.driver_id for row in rows])
    return sorted((_document(row, people) for row in rows), key=lambda item: item["status"] != "pending")


def review_document(db: Session, admin: User, document_id: UUID, status: str, note: str | None) -> dict:
    """Aprueba o rechaza un documento y avisa al conductor; al rechazar, el motivo es obligatorio."""
    if status not in {"approved", "rejected"}:
        raise AppError(400, "Estado de documento inválido")
    note = (note or "").strip() or None
    if status == "rejected" and not note:
        raise AppError(400, "Escribe el motivo del rechazo para el conductor")
    row = db.get(DriverDocument, document_id)
    if row is None:
        raise AppError(404, "No encontramos el documento")
    row.status = status
    row.note = note
    row.reviewed_at = utcnow()
    row.reviewed_by = admin.id
    driver = db.get(Driver, row.driver_id)
    label = DOCUMENT_LABELS.get(row.kind, "Documento")
    if driver:
        if status == "approved":
            notify(db, driver.user_id, f"{label} aprobado", "Tu documento fue revisado y aprobado.", {"document_id": str(row.id)})
        else:
            notify(db, driver.user_id, f"{label} rechazado", note or "", {"document_id": str(row.id)})
    audit(db, admin.id, f"document_{status}", {"document_id": str(row.id)})
    db.commit()
    return _document(row, drivers_by_id(db, [row.driver_id]))


def list_complaints(db: Session, status: str | None = None, author_role: str | None = None) -> list[dict]:
    """Quejas de pasajeros y de conductores con el viaje y ambas personas."""
    query = select(Complaint).order_by(Complaint.created_at.desc())
    if status:
        query = query.where(Complaint.status == status)
    if author_role:
        query = query.where(Complaint.author_role == author_role)
    rows = db.scalars(query).all()
    passengers = passengers_by_id(db, [row.passenger_id for row in rows])
    drivers = drivers_by_id(db, [row.driver_id for row in rows])
    labels = {}
    if rows:
        labels = {
            ride_id: (origin, destination)
            for ride_id, origin, destination in db.execute(
                text(
                    """
                    SELECT r.id, q.origin_label, q.destination_label
                    FROM rides r JOIN ride_requests q ON q.id = r.ride_request_id
                    WHERE r.id = ANY(:ids)
                    """
                ),
                {"ids": [row.ride_id for row in rows]},
            ).all()
        }
    return [
        {
            "id": str(row.id),
            "ride_id": str(row.ride_id),
            "author_role": row.author_role,
            "category": row.category,
            "description": row.description,
            "status": row.status,
            "origin_label": labels.get(row.ride_id, (None, None))[0],
            "destination_label": labels.get(row.ride_id, (None, None))[1],
            "passenger": passengers.get(row.passenger_id),
            "driver": drivers.get(row.driver_id),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
        }
        for row in rows
    ]
