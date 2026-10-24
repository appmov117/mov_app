from typing import Literal

from app.vehicles.schemas import VehicleCreate
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=10, max_length=20)
    email: str | None = None
    password: str = Field(min_length=8, max_length=72)
    role: Literal["passenger", "driver"]
    referral_code: str | None = None
    vehicle: VehicleCreate | None = None


class LoginIn(BaseModel):
    identifier: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
