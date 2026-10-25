import math
from datetime import UTC, datetime
from decimal import Decimal

from app.analytics.models import AnalyticsEvent, AuditLog
from sqlalchemy import text
from sqlalchemy.orm import Session


def utcnow() -> datetime:
    return datetime.now(UTC)


def money(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def days_remaining(expires_at: datetime) -> int:
    seconds = (expires_at - utcnow()).total_seconds()
    if seconds <= 0:
        return 0
    return max(1, math.ceil(seconds / 86400))


def audit(db: Session, user_id, event_type: str, metadata: dict | None = None) -> None:
    db.add(AuditLog(user_id=user_id, event_type=event_type, metadata_json=metadata))


def track(db: Session, user_id, event_type: str, metadata: dict | None = None) -> None:
    db.add(AnalyticsEvent(user_id=user_id, event_type=event_type, metadata_json=metadata))


def point_sql(lat_key: str, lng_key: str) -> str:
    return f"ST_SetSRID(ST_MakePoint(:{lng_key}, :{lat_key}), 4326)::geography"


def read_point(db: Session, table: str, id_column: str, id_value, column: str) -> dict | None:
    row = db.execute(
        text(
            f"""
            SELECT ST_Y({column}::geometry) AS lat, ST_X({column}::geometry) AS lng
            FROM {table}
            WHERE {id_column} = :id
            """
        ),
        {"id": id_value},
    ).one_or_none()
    if row is None or row.lat is None:
        return None
    return {"latitude": float(row.lat), "longitude": float(row.lng)}
