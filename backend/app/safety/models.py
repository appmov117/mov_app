import uuid
from datetime import datetime

from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class SafetyAlert(Base):
    """Alerta de pánico enviada por un pasajero durante un viaje.

    La columna ``location`` (GEOGRAPHY) se escribe y lee con SQL de PostGIS.
    """

    __tablename__ = "safety_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rides.id"))
    passenger_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("passengers.id"))
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drivers.id")
    )
    status: Mapped[str] = mapped_column(Text, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    attended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attended_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


class SafetyRecording(Base):
    """Segmento de audio o video grabado por el pasajero durante un viaje."""

    __tablename__ = "safety_recordings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rides.id"))
    passenger_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("passengers.id"))
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    segment: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(Text)
    file_url: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
