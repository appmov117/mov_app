from app.core.security import hash_password
from app.db.session import SessionLocal
from app.referrals.models import Referral
from app.referrals.service import on_passenger_ride_completed
from app.users.models import User
from sqlalchemy import text
from tests.conftest import make_admin, ready_driver

FULL = "https://mpago.la/1yrVnj4"
HALF = "https://mpago.la/1HwzpQZ"


def refer_passengers(driver_id: str, count: int) -> None:
    """Simula pasajeros referidos que completan su primer viaje este mes."""
    db = SessionLocal()
    for index in range(count):
        user = User(
            name=f"Referido {index}",
            phone=f"99960{index:05d}",
            email=f"referido{index}@ruta.local",
            password_hash=hash_password("clave1234"),
            role="passenger",
        )
        db.add(user)
        db.flush()
        db.add(Referral(driver_id=driver_id, referred_user_id=user.id, referral_code="X"))
        db.flush()
        on_passenger_ride_completed(db, user.id)
    db.commit()
    db.close()


def setup(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9995500001", "mitad@ruta.local", 20.9674, -89.5926, admin)
    for name, url in (("payment-link", FULL), ("half-payment-link", HALF)):
        assert client.put(f"/api/v1/admin/settings/{name}", headers=admin, json={"url": url}).status_code == 200
    driver_id = client.get("/api/v1/drivers/me", headers=driver).json()["id"]
    return admin, driver, driver_id


def membership(client, driver):
    return client.get("/api/v1/drivers/me/membership", headers=driver).json()


def test_ten_referrals_make_next_renewal_half_price_once(client):
    admin, driver, driver_id = setup(client)
    assert membership(client, driver)["price"] == 200

    refer_passengers(driver_id, 12)
    view = membership(client, driver)
    assert (view["price"], view["payment_url"], view["discount"]) == (100, HALF, "half")
    # Con 10 ya no se suman 30 días: solo quedan los 7 por llegar a 3.
    assert client.get("/api/v1/drivers/me/referral", headers=driver).json()["reward_days"] == 7

    payment = client.post("/api/v1/drivers/me/membership/payment", headers=driver, json={}).json()
    assert (payment["amount"], payment["payment_url"]) == (100, HALF)
    assert client.post(f"/api/v1/admin/payments/{payment['payment_id']}/approve", headers=admin).status_code == 200

    after = membership(client, driver)
    db = SessionLocal()
    spans = db.execute(
        text("SELECT expires_at - starts_at FROM memberships WHERE driver_id = :id ORDER BY created_at DESC LIMIT 1"),
        {"id": driver_id},
    ).scalar()
    db.close()
    assert spans.days == 30
    assert (after["price"], after["payment_url"], after["discount"]) == (200, FULL, None)


def test_rejected_half_price_payment_keeps_the_discount(client):
    admin, driver, driver_id = setup(client)
    refer_passengers(driver_id, 10)
    payment = client.post("/api/v1/drivers/me/membership/payment", headers=driver, json={}).json()
    assert client.post(f"/api/v1/admin/payments/{payment['payment_id']}/reject", headers=admin).status_code == 200
    assert membership(client, driver)["price"] == 100
