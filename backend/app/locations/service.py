from app.config.settings import settings
from app.core.errors import AppError
from app.core.ws import passenger_room, publish
from app.rides import repository
from app.rides.service import ACTIVE_RIDE, _active_ride_for_driver, driver_for_user
from app.users.models import User
from sqlalchemy.orm import Session


def update_location(db: Session, user: User, latitude: float, longitude: float, heading, speed) -> dict:
    driver = driver_for_user(db, user)
    if driver.driver_status == "offline":
        raise AppError(409, "Conéctate para compartir tu ubicación")
    previous = repository.driver_coords(db, driver.id)
    if previous and settings.location_min_interval_s > 0:
        from datetime import timedelta

        from sqlalchemy import text

        row = db.execute(
            text("SELECT updated_at FROM driver_locations WHERE driver_id = :id"),
            {"id": driver.id},
        ).one_or_none()
        if row and row.updated_at:
            from app.core.support import utcnow

            updated = row.updated_at
            if updated.tzinfo is None:
                from datetime import UTC

                updated = updated.replace(tzinfo=UTC)
            if utcnow() - updated < timedelta(seconds=settings.location_min_interval_s):
                raise AppError(429, "Espera unos segundos antes de enviar otra ubicación")
    repository.upsert_location(db, driver.id, latitude, longitude, heading, speed)
    db.commit()
    ride = _active_ride_for_driver(db, driver.id)
    point = {"latitude": latitude, "longitude": longitude, "heading": heading, "speed": speed}
    if ride and ride.status in ACTIVE_RIDE:
        publish(str(ride.id), {"type": "driver_location", "data": point}, passenger_room(ride.passenger_id))
    return point
