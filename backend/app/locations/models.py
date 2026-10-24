import uuid
from datetime import datetime
from decimal import Decimal

from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class DriverLocation(Base):
    __tablename__ = "driver_locations"

    driver_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drivers.id"), primary_key=True
    )
    heading: Mapped[Decimal | None] = mapped_column(Numeric)
    speed: Mapped[Decimal | None] = mapped_column(Numeric)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
