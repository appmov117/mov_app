import uuid
from datetime import datetime
from decimal import Decimal

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    driver_status: Mapped[str] = mapped_column(Text, default="offline")
    verification_status: Mapped[str] = mapped_column(Text, default="pending")
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("5.00"))
    completed_rides: Mapped[int] = mapped_column(Integer, default=0)
    cancelled_rides: Mapped[int] = mapped_column(Integer, default=0)
    paused_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Si es True, el pasajero recibe un código de 4 dígitos que el conductor escribe al iniciar.
    require_pin: Mapped[bool] = mapped_column(Boolean, default=False)
    # CLABE, banco y titular para que el pasajero pague por transferencia.
    payout: Mapped[dict | None] = mapped_column(JSONB)
    # Lo que acepta u ofrece: mascotas, aire acondicionado, equipaje grande, pago con tarjeta.
    amenities: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DriverDocument(Base):
    __tablename__ = "driver_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"))
    kind: Mapped[str] = mapped_column(Text)
    file_url: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)


class DriverSession(Base):
    __tablename__ = "driver_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
