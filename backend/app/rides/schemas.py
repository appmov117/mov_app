from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class PointIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RideRequestIn(BaseModel):
    origin: PointIn
    destination: PointIn
    stops: list[PointIn] = Field(default_factory=list, max_length=4)
    service: Literal["auto", "moto", "paquete"] = "auto"
    origin_label: str | None = Field(default=None, max_length=160)
    destination_label: str | None = Field(default=None, max_length=160)


class CounterIn(BaseModel):
    amount: Decimal = Field(gt=0, le=10000, max_digits=10, decimal_places=2)


class RejectIn(BaseModel):
    pause_minutes: int | None = Field(default=None, ge=1, le=60)


class CompleteIn(BaseModel):
    fare_amount: float = Field(gt=0, le=10000)
    payment_method: str


class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)
