from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.schemas import RegisterIn
from app.auth.service import register
from app.core.security import hash_password
from app.drivers.models import Driver, DriverSession
from app.memberships.service import open_membership
from app.rides import repository
from app.users.models import User
from app.vehicles.schemas import VehicleCreate


def seed_if_empty(db: Session) -> None:
    # Cualquier administrador basta: el correo del admin inicial puede cambiarse después.
    if db.scalar(select(User.id).where(User.role == "admin").limit(1)):
        return
    db.add(
        User(
            name="Admin Ruta",
            phone="9990000000",
            email="admin@ruta.local",
            password_hash=hash_password("Admin1234"),
            role="admin",
            status="active",
        )
    )
    db.commit()
    drivers = [
        ("Ana López", "9991110001", "ana@ruta.local", "Nissan", "Versa", "Blanco", "RUTA01", 20.9674, -89.5926),
        ("Luis Pérez", "9991110002", "luis@ruta.local", "Chevrolet", "Aveo", "Gris", "RUTA02", 20.9750, -89.6000),
        ("Marta Ruiz", "9991110003", "marta@ruta.local", "Volkswagen", "Vento", "Rojo", "RUTA03", 20.9600, -89.5800),
    ]
    for name, phone, email, brand, model, color, plate, lat, lng in drivers:
        register(
            db,
            RegisterIn(
                name=name,
                phone=phone,
                email=email,
                password="Conductor1234",
                role="driver",
                vehicle=VehicleCreate(brand=brand, model=model, year=2020, color=color, plate=plate),
            ),
        )
        user = db.scalar(select(User).where(User.email == email))
        driver = db.scalar(select(Driver).where(Driver.user_id == user.id))
        driver.verification_status = "approved"
        driver.driver_status = "online"
        open_membership(db, driver.id, Decimal("200"))
        repository.upsert_location(db, driver.id, lat, lng, 0, 0)
        db.add(DriverSession(driver_id=driver.id))
        db.commit()
    register(
        db,
        RegisterIn(
            name="María Solís",
            phone="9992220001",
            email="maria@ruta.local",
            password="Pasajero1234",
            role="passenger",
        ),
    )
