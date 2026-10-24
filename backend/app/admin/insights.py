"""Análisis del panel: mapa de calor, opiniones, membresías y avisos masivos."""

from datetime import timedelta
from decimal import Decimal

from app.admin.people import drivers_by_id, passengers_by_id
from app.analytics.models import AuditLog
from app.core.errors import AppError
from app.core.hexes import hex_features
from app.core.support import audit, money, utcnow
from app.drivers.models import Driver
from app.memberships.models import Membership, MembershipPayment
from app.memberships.service import membership_view
from app.notifications.service import notify
from app.ratings.models import Rating
from app.users.models import User
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

H3_RESOLUTION = 9
HEAT_KINDS = {
    "demand": "TRUE",
    "unserved": "status = 'expired'",
    "served": "status = 'accepted'",
}
AUDIENCES = {"drivers": ("driver",), "passengers": ("passenger",), "all": ("driver", "passenger")}


def heatmap(db: Session, days: int, kind: str) -> dict:
    """Agrupa los puntos de recogida en hexágonos H3 de resolución 9 (unos 0.1 km² cada uno).

    Args:
        db: Sesión de base de datos.
        days: Ventana hacia atrás, de 1 a 90 días.
        kind: `demand` (todas las solicitudes), `served` (con conductor) o `unserved` (vencidas).

    Returns:
        Una FeatureCollection GeoJSON con el conteo por hexágono y el total.
    """
    if kind not in HEAT_KINDS or not 1 <= days <= 90:
        raise AppError(400, "Filtro de mapa de calor inválido")
    rows = db.execute(
        text(
            f"""
            SELECT ST_Y(origin::geometry) AS lat, ST_X(origin::geometry) AS lng
            FROM ride_requests
            WHERE created_at >= NOW() - make_interval(days => :days) AND {HEAT_KINDS[kind]}
            """
        ),
        {"days": days},
    ).all()
    features = hex_features(((row.lat, row.lng, {}) for row in rows), H3_RESOLUTION)
    top = max((feature["properties"]["count"] for feature in features), default=0)
    return {"type": "FeatureCollection", "features": features, "total": len(rows), "max": top}


def feedback(db: Session, author_role: str | None, limit: int = 200) -> dict:
    """Calificaciones recientes en ambos sentidos, con su comentario y promedio por autor."""
    if author_role not in {None, "passenger", "driver"}:
        raise AppError(400, "Filtro de opiniones inválido")
    query = select(Rating).order_by(Rating.created_at.desc()).limit(limit)
    if author_role:
        query = query.where(Rating.author_role == author_role)
    rows = db.scalars(query).all()
    passengers = passengers_by_id(db, [row.passenger_id for row in rows])
    drivers = drivers_by_id(db, [row.driver_id for row in rows])
    averages = dict(db.execute(select(Rating.author_role, func.avg(Rating.rating)).group_by(Rating.author_role)).all())
    return {
        "average_by_passengers": round(float(averages["passenger"]), 2) if averages.get("passenger") else None,
        "average_by_drivers": round(float(averages["driver"]), 2) if averages.get("driver") else None,
        "items": [
            {
                "id": str(row.id),
                "ride_id": str(row.ride_id),
                "author_role": row.author_role,
                "rating": row.rating,
                "comment": row.comment,
                "passenger": passengers.get(row.passenger_id),
                "driver": drivers.get(row.driver_id),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }


def memberships(db: Session) -> dict:
    """Estado de la membresía de cada conductor e ingresos aprobados del mes."""
    month_start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue = db.scalar(
        select(func.coalesce(func.sum(MembershipPayment.amount), 0)).where(
            MembershipPayment.status == "approved", MembershipPayment.reviewed_at >= month_start
        )
    )
    driver_ids = list(db.scalars(select(Driver.id)).all())
    people = drivers_by_id(db, driver_ids)
    items = [people[driver_id] | {"membership": membership_view(db, driver_id)} for driver_id in driver_ids]
    status_of = [item["membership"]["status"] for item in items]
    expiring = sum(
        1 for item in items if item["membership"]["status"] == "active" and item["membership"]["days_remaining"] <= 3
    )
    last_30 = db.scalar(
        select(func.count()).select_from(Membership).where(Membership.created_at >= utcnow() - timedelta(days=30))
    )
    return {
        "active": status_of.count("active"),
        "expiring": expiring,
        "expired": status_of.count("expired"),
        "pending": status_of.count("pending"),
        "without": status_of.count("none"),
        "revenue_month": money(revenue or Decimal("0")),
        "opened_last_30_days": int(last_30 or 0),
        "items": sorted(items, key=lambda item: (item["membership"]["status"] != "pending", item["name"])),
    }


def broadcast(db: Session, admin: User, audience: str, title: str, body: str) -> dict:
    """Envía un aviso (en la app y push) a todos los conductores, pasajeros o ambos."""
    if audience not in AUDIENCES:
        raise AppError(400, "Elige a quién enviar el aviso")
    title, body = title.strip(), body.strip()
    if not title or not body:
        raise AppError(400, "Escribe un título y un mensaje")
    users = db.scalars(select(User.id).where(User.role.in_(AUDIENCES[audience]), User.status == "active")).all()
    for user_id in users:
        notify(db, user_id, title, body, {"kind": "broadcast"})
    audit(db, admin.id, "broadcast_sent", {"audience": audience, "title": title, "body": body, "count": len(users)})
    db.commit()
    return {"audience": audience, "count": len(users)}


def broadcasts(db: Session, limit: int = 30) -> list[dict]:
    """Avisos masivos enviados, del más reciente al más antiguo."""
    rows = db.scalars(
        select(AuditLog).where(AuditLog.event_type == "broadcast_sent").order_by(AuditLog.created_at.desc()).limit(limit)
    ).all()
    return [
        (row.metadata_json or {}) | {"id": row.id, "created_at": row.created_at.isoformat() if row.created_at else None}
        for row in rows
    ]
