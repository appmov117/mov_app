from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class PointIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PackageIn(BaseModel):
    description: str = Field(min_length=2, max_length=140)
    recipient_name: str = Field(min_length=2, max_length=80)
    recipient_phone: str = Field(pattern=r"^\d{10}$")


class RideRequestIn(BaseModel):
    origin: PointIn
    destination: PointIn
    stops: list[PointIn] = Field(default_factory=list, max_length=4)
    service: Literal["auto", "moto", "paquete", "paquete_moto"] = "auto"
    origin_label: str | None = Field(default=None, max_length=160)
    destination_label: str | None = Field(default=None, max_length=160)
    # Precio que propone el pasajero ("pon tu precio"); sin él se usa la tarifa mínima.
    offered_fare: Decimal | None = Field(default=None, gt=0, le=10000, max_digits=7, decimal_places=2)
    package: PackageIn | None = None

    @model_validator(mode="after")
    def package_details(self):
        if self.service in ("paquete", "paquete_moto") and self.package is None:
            raise ValueError("Indica qué envías y quién lo recibe")
        return self


class CounterIn(BaseModel):
    amount: Decimal = Field(gt=0, le=10000, max_digits=10, decimal_places=2)


class RejectIn(BaseModel):
    pause_minutes: int | None = Field(default=None, ge=1, le=60)


class CompleteIn(BaseModel):
    fare_amount: float = Field(gt=0, le=10000)
    payment_method: str
    delivery_code: str | None = Field(default=None, max_length=8)


class StartIn(BaseModel):
    pin: str | None = Field(default=None, max_length=8)


class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)
