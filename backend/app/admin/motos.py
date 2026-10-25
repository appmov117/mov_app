"""Sección de motos del panel: conductores que trabajan en moto y su actividad."""

from datetime import timedelta

from app.core.support import money, utcnow
from app.drivers.models import Driver
from app.rides.models import Ride, RideRequest
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def moto_overview(db: Session) -> dict:
    """Conductores con moto activa y los números de la semana de viajes en moto."""
    rows = db.execute(
        select(Driver, User, Vehicle)
        .join(User, User.id == Driver.user_id)
        .join(Vehicle, (Vehicle.driver_id == Driver.id) & Vehicle.active.is_(True))
        .where(Vehicle.kind == "moto")
        .order_by(Driver.created_at.desc())
    ).all()
    week = utcnow() - timedelta(days=7)
    completed = select(Ride).join(RideRequest, RideRequest.id == Ride.ride_request_id).where(
        RideRequest.service == "moto", Ride.status == "completed", Ride.completed_at >= week
    )
    count = db.scalar(select(func.count()).select_from(completed.subquery())) or 0
    volume = db.scalar(select(func.coalesce(func.sum(completed.subquery().c.fare_amount), 0)))
    return {
        "drivers": [
            {
                "id": str(driver.id),
                "name": user.name,
                "phone": user.phone,
                "status": driver.driver_status,
                "verification_status": driver.verification_status,
                "rating": float(driver.rating),
                "vehicle": f"{vehicle.brand} {vehicle.model}",
                "plate": vehicle.plate,
            }
            for driver, user, vehicle in rows
        ],
        "online": sum(1 for driver, _, _ in rows if driver.driver_status != "offline"),
        "rides_week": int(count),
        "volume_week": money(volume) or 0,
    }
