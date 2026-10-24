"""Ajustes editables desde el panel de administración, con respaldo en las variables de entorno."""

from datetime import datetime
from urllib.parse import urlparse

from app.config.settings import settings
from app.core.errors import AppError
from app.db.base import Base
from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import Mapped, Session, mapped_column

PAYMENT_LINK = "membership_payment_url"


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def payment_url(db: Session) -> str:
    """Liga de pago de la membresía: la guardada por el admin o, si no hay, la del entorno."""
    row = db.get(AppSetting, PAYMENT_LINK)
    return row.value if row else settings.membership_payment_url


def set_payment_url(db: Session, url: str) -> str:
    """Guarda la liga de pago tras validar que sea una dirección https.

    Args:
        db: Sesión de base de datos.
        url: Liga de cobro, por ejemplo de Mercado Pago.

    Returns:
        La liga guardada.
    """
    value = url.strip()
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or len(value) > 500:
        raise AppError(400, "La liga debe empezar con https://")
    row = db.get(AppSetting, PAYMENT_LINK)
    if row is None:
        db.add(AppSetting(key=PAYMENT_LINK, value=value))
    else:
        row.value = value
        row.updated_at = func.now()
    return value
