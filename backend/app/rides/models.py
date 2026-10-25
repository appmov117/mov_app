import uuid
from datetime import datetime
from decimal import Decimal

from app.db.base import Base
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class RideRequest(Base):
    __tablename__ = "ride_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    passenger_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("passengers.id"))
    origin_label: Mapped[str | None] = mapped_column(Text)
    destination_label: Mapped[str | None] = mapped_column(Text)
    estimated_distance_m: Mapped[int | None] = mapped_column(Integer)
    estimated_duration_s: Mapped[int | None] = mapped_column(Integer)
    estimated_fare: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    route_geometry: Mapped[dict | None] = mapped_column(JSONB)
    stops: Mapped[list] = mapped_column(JSONB, default=list)
    service: Mapped[str] = mapped_column(Text, default="auto")
    wave: Mapped[int] = mapped_column(Integer, default=0)
    wave_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="searching")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RideOffer(Base):
    __tablename__ = "ride_offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ride_requests.id"))
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"))
    status: Mapped[str] = mapped_column(Text, default="pending")
    # Medidos por calles con la Matrix API al ofrecer el viaje; se reutilizan en lugar de recalcular.
    pickup_distance_m: Mapped[int | None] = mapped_column(Integer)
    pickup_eta_s: Mapped[int | None] = mapped_column(Integer)
    offered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    proposed_fare: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    countered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Ride(Base):
    __tablename__ = "rides"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ride_requests.id"), unique=True
    )
    passenger_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("passengers.id"))
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    distance_m: Mapped[int | None] = mapped_column(Integer)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    fare_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    payment_method: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    current_stop_index: Mapped[int] = mapped_column(Integer, default=0)
    stop_arrived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RideEvent(Base):
    __tablename__ = "ride_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ride_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rides.id"))
    event_type: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
