from uuid import UUID, uuid4

from app.passengers.models import FavoriteDriver
from app.rides import repository
from app.rides.service import history_for_passenger, passenger_for_user
from app.users.models import User
from sqlalchemy import select
from sqlalchemy.orm import Session


def me(db: Session, user: User) -> dict:
    passenger = passenger_for_user(db, user)
    return {
        "id": str(passenger.id),
        "name": user.name,
        "phone": user.phone,
        "email": user.email,
        "total_rides": passenger.total_rides,
        "places": repository.list_places(db, passenger.id),
    }


def update_me(db: Session, user: User, name: str | None) -> dict:
    if name:
        user.name = name.strip()
    db.commit()
    return me(db, user)


def add_favorite(db: Session, user: User, driver_id: UUID) -> dict:
    passenger = passenger_for_user(db, user)
    existing = db.get(FavoriteDriver, {"passenger_id": passenger.id, "driver_id": driver_id})
    if existing is None:
        db.add(FavoriteDriver(passenger_id=passenger.id, driver_id=driver_id))
        db.commit()
    return {"driver_id": str(driver_id)}


def remove_favorite(db: Session, user: User, driver_id: UUID) -> None:
    passenger = passenger_for_user(db, user)
    row = db.get(FavoriteDriver, {"passenger_id": passenger.id, "driver_id": driver_id})
    if row:
        db.delete(row)
        db.commit()


def list_favorites(db: Session, user: User) -> list[dict]:
    from app.drivers.models import Driver

    passenger = passenger_for_user(db, user)
    rows = db.execute(
        select(FavoriteDriver, Driver, User)
        .join(Driver, Driver.id == FavoriteDriver.driver_id)
        .join(User, User.id == Driver.user_id)
        .where(FavoriteDriver.passenger_id == passenger.id)
    ).all()
    return [
        {"driver_id": str(driver.id), "name": account.name, "rating": float(driver.rating)}
        for _fav, driver, account in rows
    ]


def add_place(db: Session, user: User, label: str, kind: str, latitude: float, longitude: float) -> dict:
    passenger = passenger_for_user(db, user)
    place_id = uuid4()
    repository.save_place(db, place_id, passenger.id, label.strip(), kind, latitude, longitude)
    db.commit()
    return {"id": str(place_id), "label": label.strip(), "kind": kind, "latitude": latitude, "longitude": longitude}


def list_places(db: Session, user: User) -> list[dict]:
    passenger = passenger_for_user(db, user)
    return repository.list_places(db, passenger.id)


def delete_place(db: Session, user: User, place_id: UUID) -> None:
    passenger = passenger_for_user(db, user)
    from sqlalchemy import text

    db.execute(
        text("DELETE FROM saved_places WHERE id = :id AND passenger_id = :passenger_id"),
        {"id": place_id, "passenger_id": passenger.id},
    )
    db.commit()


def rides(db: Session, user: User) -> list[dict]:
    return history_for_passenger(db, user)
