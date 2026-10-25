from datetime import UTC, datetime
from decimal import Decimal

from app.db.session import SessionLocal
from app.rides import pricing
from app.rides.extras import valid_clabe
from sqlalchemy import text
from tests.conftest import login, make_admin, ready_driver, register

TRIP = {
    "origin": {"latitude": 20.9674, "longitude": -89.5926},
    "destination": {"latitude": 20.99, "longitude": -89.63},
}
PACKAGE = {"description": "Sobre con documentos", "recipient_name": "Rosa Pech", "recipient_phone": "9991234567"}
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 200


def passenger(client) -> dict:
    register(client, "passenger", "9992000001", "extras-pax@ruta.local")
    return login(client, "extras-pax@ruta.local")


def first_offer(client, driver) -> dict:
    return client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]


def accept(client, driver) -> str:
    offer = first_offer(client, driver)
    return client.post(f"/api/v1/ride-offers/{offer['id']}/accept", headers=driver).json()["id"]


def arrive(client, driver, ride_id: str) -> None:
    client.post(f"/api/v1/rides/{ride_id}/arriving", headers=driver)
    client.post(f"/api/v1/rides/{ride_id}/arrived", headers=driver)


def test_passenger_offers_up_to_twenty_percent_less(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9992000010", "pon-precio@ruta.local", 20.9674, -89.5926, admin)
    headers = passenger(client)
    estimate = client.post("/api/v1/ride-requests/estimate", headers=headers, json=TRIP).json()
    minimum = Decimal(str(estimate["fare"]))
    floor = (minimum * Decimal("0.8")).quantize(Decimal("1"), rounding="ROUND_UP")

    too_low = client.post("/api/v1/ride-requests", headers=headers, json=TRIP | {"offered_fare": float(floor - 1)})
    assert too_low.status_code == 400
    created = client.post("/api/v1/ride-requests", headers=headers, json=TRIP | {"offered_fare": float(floor)}).json()
    assert created["estimated_fare"] == float(floor)
    assert created["min_fare"] == float(minimum)

    offer = first_offer(client, driver)
    assert offer["passenger_offered"] is True
    assert offer["estimated_fare"] == float(floor)
    assert offer["min_counter_fare"] == float(minimum)
    url = f"/api/v1/ride-offers/{offer['id']}/counter"
    assert client.post(url, headers=driver, json={"amount": float(minimum - 1)}).status_code == 400
    assert client.post(url, headers=driver, json={"amount": float(minimum)}).status_code == 200


def test_start_pin_is_required_only_when_the_driver_enables_it(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9992000020", "pin@ruta.local", 20.9674, -89.5926, admin)
    assert client.put("/api/v1/drivers/me/security", headers=driver, json={"require_pin": True}).json() == {"require_pin": True}
    headers = passenger(client)
    client.post("/api/v1/ride-requests", headers=headers, json=TRIP)
    ride_id = accept(client, driver)

    pin = client.get("/api/v1/passengers/me/active", headers=headers).json()["ride"]["start_pin"]
    assert len(pin) == 4 and pin.isdigit()
    driver_view = client.get("/api/v1/drivers/me/active", headers=driver).json()
    assert driver_view["pin_required"] is True and "start_pin" not in driver_view

    arrive(client, driver, ride_id)
    assert client.post(f"/api/v1/rides/{ride_id}/start", headers=driver).status_code == 400
    wrong = "0000" if pin != "0000" else "1111"
    assert client.post(f"/api/v1/rides/{ride_id}/start", headers=driver, json={"pin": wrong}).status_code == 400
    started = client.post(f"/api/v1/rides/{ride_id}/start", headers=driver, json={"pin": pin})
    assert started.status_code == 200 and started.json()["status"] == "in_progress"


def test_package_needs_details_photo_and_recipient_code(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9992000030", "paquete@ruta.local", 20.9674, -89.5926, admin)
    headers = passenger(client)
    missing = client.post("/api/v1/ride-requests", headers=headers, json=TRIP | {"service": "paquete"})
    assert missing.status_code == 422
    client.post("/api/v1/ride-requests", headers=headers, json=TRIP | {"service": "paquete", "package": PACKAGE})
    assert first_offer(client, driver)["package"]["recipient_name"] == "Rosa Pech"
    ride_id = accept(client, driver)
    code = client.get("/api/v1/passengers/me/active", headers=headers).json()["ride"]["delivery_code"]
    arrive(client, driver, ride_id)
    client.post(f"/api/v1/rides/{ride_id}/start", headers=driver)

    finish = {"fare_amount": 50, "payment_method": "cash", "delivery_code": code}
    no_photo = client.post(f"/api/v1/rides/{ride_id}/complete", headers=driver, json=finish)
    assert no_photo.status_code == 400 and "foto" in no_photo.json()["detail"]
    photo = client.post(
        f"/api/v1/rides/{ride_id}/delivery-photo", headers=driver, files={"file": ("entrega.jpg", JPEG, "image/jpeg")}
    )
    assert photo.status_code == 200, photo.text
    wrong = finish | {"delivery_code": "0000" if code != "0000" else "1111"}
    assert client.post(f"/api/v1/rides/{ride_id}/complete", headers=driver, json=wrong).status_code == 400
    done = client.post(f"/api/v1/rides/{ride_id}/complete", headers=driver, json=finish)
    assert done.status_code == 200 and done.json()["has_delivery_photo"] is True
    image = client.get(f"/api/v1/rides/{ride_id}/delivery-photo", headers=headers)
    assert image.status_code == 200 and image.content == JPEG


def test_surcharges_by_time_band_and_special_switch(client):
    db = SessionLocal()
    pricing.set_surcharges(
        db,
        {
            "bands": [{"start": "22:00", "end": "06:00", "percent": 20, "label": "Nocturna"}],
            "special": {"active": True, "percent": 10, "label": "Lluvia"},
        },
    )
    db.commit()
    # 04:00 UTC son las 22:00 en Mérida (UTC-6); 18:00 UTC son las 12:00.
    assert pricing.current_surcharge(db, datetime(2026, 10, 25, 4, 0, tzinfo=UTC)) == (30, "Nocturna + Lluvia")
    assert pricing.current_surcharge(db, datetime(2026, 10, 25, 18, 0, tzinfo=UTC)) == (10, "Lluvia")
    assert pricing.fare(db, "auto", 8000, 30) == Decimal("88.40")
    db.close()

    admin = make_admin(client)
    bad = {"bands": [{"start": "25:00", "end": "06:00", "percent": 20, "label": "x"}], "special": {"active": False, "percent": 0, "label": "x"}}
    assert client.put("/api/v1/admin/surcharges", headers=admin, json=bad).status_code == 422
    assert client.get("/api/v1/admin/surcharges", headers=admin).json()["special"]["label"] == "Lluvia"


def test_driver_payout_is_validated_and_shown_to_the_passenger(client):
    assert valid_clabe("002010077777777771")
    assert not valid_clabe("002010077777777772")
    admin = make_admin(client)
    driver = ready_driver(client, "9992000040", "clabe@ruta.local", 20.9674, -89.5926, admin)
    data = {"clabe": "002010077777777772", "bank": "Banamex", "holder": "Luis Pérez"}
    assert client.put("/api/v1/drivers/me/payout", headers=driver, json=data).status_code == 400
    data["clabe"] = "002010077777777771"
    assert client.put("/api/v1/drivers/me/payout", headers=driver, json=data).status_code == 200

    headers = passenger(client)
    client.post("/api/v1/ride-requests", headers=headers, json=TRIP)
    accept(client, driver)
    ride = client.get("/api/v1/passengers/me/active", headers=headers).json()["ride"]
    assert ride["driver_payout"] == data
    assert ride["start_pin"] is None
    db = SessionLocal()
    assert db.execute(text("SELECT count(*) FROM rides WHERE start_pin IS NOT NULL")).scalar() == 0
    db.close()


def test_moto_delivery_uses_moto_tariff_and_amenities_show_on_profile(client):
    db = SessionLocal()
    assert pricing.fare(db, "paquete_moto", 8000) == Decimal("32.90")
    db.close()
    admin = make_admin(client)
    driver = ready_driver(client, "9992000050", "mascotas@ruta.local", 20.9674, -89.5926, admin)
    saved = client.put("/api/v1/drivers/me/amenities", headers=driver, json={"pets": True, "card": True}).json()
    assert saved == {"pets": True, "ac": False, "luggage": False, "card": True, "transfer": False}
    assert client.get("/api/v1/drivers/me", headers=driver).json()["amenities"]["pets"] is True

    headers = passenger(client)
    client.post("/api/v1/ride-requests", headers=headers, json=TRIP)
    accept(client, driver)
    ride = client.get("/api/v1/passengers/me/active", headers=headers).json()["ride"]
    assert ride["driver"]["amenities"]["pets"] is True and ride["driver"]["amenities"]["ac"] is False
    assert ride["driver"]["avatar_url"] is None
    assert ride["driver"]["vehicle"]["year"] == 2021 and ride["driver"]["vehicle"]["kind"] == "auto"
