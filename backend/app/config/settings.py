from decimal import Decimal
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(str(ROOT_ENV), ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://ruta:ruta@localhost:5433/ruta"
    jwt_secret: str = "dev-only-change-me"
    access_token_minutes: int = 60
    refresh_token_days: int = 90
    cors_origins: str = "http://localhost:5173"
    public_app_url: str = "http://localhost:5173"
    membership_price: Decimal = Decimal("200")
    membership_days: int = 30
    free_membership_days: int = 180
    document_grace_days: int = 15
    membership_payment_url: str = "https://www.mercadopago.com.mx"
    base_fare: Decimal = Decimal("20")
    per_km: Decimal = Decimal("6")
    moto_base_fare: Decimal = Decimal("15")
    moto_per_km: Decimal = Decimal("4")
    package_factor: Decimal = Decimal("0.70")
    zone_name: str = "Centro de Mérida"
    zone_lat: float = 20.9674
    zone_lng: float = -89.5926
    # Mérida usa UTC-6 todo el año; los recargos por horario se evalúan en esta hora local.
    zone_utc_offset_hours: int = -6
    seed: bool = True
    testing: bool = False
    location_min_interval_s: float = 3
    location_max_age_s: int = 600
    counter_ttl_seconds: int = 15
    vapid_public_key: str = ""
    vapid_private_key: SecretStr = SecretStr("")
    vapid_subject: str = ""
    request_ttl_seconds: int = 90
    monthly_reward_cap_days: int = 45
    redis_url: str = ""
    supabase_url: str = ""
    supabase_service_key: SecretStr = SecretStr("")
    supabase_bucket: str = "uploads"
    frontend_dist: str = ""
    mapbox_access_token: str = Field(default="", validation_alias=AliasChoices("MAPBOX_ACCESS_TOKEN", "API_KEY"))

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
