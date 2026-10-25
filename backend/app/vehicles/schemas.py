from typing import Literal

from pydantic import BaseModel, Field


class VehicleCreate(BaseModel):
    brand: str = Field(min_length=1, max_length=40)
    model: str = Field(min_length=1, max_length=40)
    year: int = Field(ge=1990, le=2035)
    color: str = Field(min_length=1, max_length=30)
    plate: str = Field(min_length=4, max_length=12)
    kind: Literal["auto", "moto"] = "auto"


class VehicleUpdate(BaseModel):
    brand: str | None = None
    model: str | None = None
    year: int | None = Field(default=None, ge=1990, le=2035)
    color: str | None = None
    plate: str | None = None
    kind: Literal["auto", "moto"] | None = None
    active: bool | None = None
