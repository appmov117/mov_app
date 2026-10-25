from decimal import Decimal

from app.db.session import SessionLocal
from app.rides.service import tick
from sqlalchemy import text
from tests.conftest import login, make_admin, ready_driver, register


def run_matcher() -> None:
    db = SessionLocal()
    tick(db)
    db.commit()
    db.close()


def request_ride(client) -> tuple[dict, dict]:
    register(client, "passenger", "9995000001", "contra-pax@ruta.local")
    passenger = login(client, "contra-pax@ruta.local")
    response = client.post(
        "/api/v1/ride-requests",
        headers=passenger,
        json={
            "origin": {"latitude": 20.9674, "longitude": -89.5926},
            "destination": {"latitude": 20.99, "longitude": -89.63},
            "origin_label": "Centro",
            "destination_label": "Destino",
        },
    )
    assert response.status_code == 200, response.text
    return passenger, response.json()


def counter_price(estimate: float) -> Decimal:
    """Un precio arriba de la tarifa mínima, como el que propondría un conductor."""
    return Decimal(str(estimate)) + Decimal("15")


def test_search_continues_after_the_only_driver_rejects(client):
    admin = make_admin(client)
    first = ready_driver(client, "9995000010", "rechaza@ruta.local", 20.9674, -89.5926, admin)
    passenger, _request = request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=first).json()[0]
    assert (
        client.post(f"/api/v1/ride-offers/{offer['id']}/reject", headers=first).status_code == 200
    )

    run_matcher()
    active = client.get("/api/v1/passengers/me/active", headers=passenger).json()
    assert active["request"]["status"] in {"searching", "offered"}

    second = ready_driver(client, "9995000011", "llega@ruta.local", 20.9680, -89.5930, admin)
    run_matcher()
    assert len(client.get("/api/v1/drivers/me/ride-offers", headers=second).json()) == 1


def test_driver_sets_any_price_above_the_minimum(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9995000020", "contra@ruta.local", 20.9674, -89.5926, admin)
    passenger, request = request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    estimate = request["estimated_fare"]
    price = Decimal(str(estimate)) * 3
    url = f"/api/v1/ride-offers/{offer['id']}/counter"

    assert offer["min_counter_fare"] == estimate
    assert client.post(url, headers=driver, json={"amount": estimate}).status_code == 400
    countered = client.post(url, headers=driver, json={"amount": float(price)})
    assert countered.status_code == 200, countered.text
    assert countered.json()["status"] == "countered"

    counters = client.get("/api/v1/passengers/me/active", headers=passenger).json()["request"][
        "counter_offers"
    ]
    assert len(counters) == 1
    assert counters[0]["proposed_fare"] == float(price)
    assert 0 < counters[0]["seconds_left"] <= 15
    assert counters[0]["driver"]["name"]

    accepted = client.post(f"/api/v1/ride-offers/{offer['id']}/counter/accept", headers=passenger)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["estimated_fare"] == float(price)
    assert (
        client.get("/api/v1/drivers/me/active", headers=driver).json()["id"]
        == accepted.json()["id"]
    )


def test_counter_offer_can_be_declined_or_expire(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9995000030", "vence@ruta.local", 20.9674, -89.5926, admin)
    passenger, request = request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    amount = float(counter_price(request["estimated_fare"]))
    client.post(
        f"/api/v1/ride-offers/{offer['id']}/counter", headers=driver, json={"amount": amount}
    )

    db = SessionLocal()
    db.execute(
        text("UPDATE ride_offers SET countered_at = NOW() - INTERVAL '20 seconds' WHERE id = :id"),
        {"id": offer["id"]},
    )
    db.commit()
    db.close()
    run_matcher()

    active = client.get("/api/v1/passengers/me/active", headers=passenger).json()
    assert active["request"]["counter_offers"] == []
    expired = client.post(f"/api/v1/ride-offers/{offer['id']}/counter/accept", headers=passenger)
    assert expired.status_code == 409


def test_passenger_declines_counter_offer(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9995000040", "declina@ruta.local", 20.9674, -89.5926, admin)
    passenger, request = request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    amount = float(counter_price(request["estimated_fare"]))
    client.post(
        f"/api/v1/ride-offers/{offer['id']}/counter", headers=driver, json={"amount": amount}
    )

    declined = client.post(f"/api/v1/ride-offers/{offer['id']}/counter/decline", headers=passenger)
    assert declined.status_code == 200, declined.text
    assert client.get("/api/v1/drivers/me/ride-offers", headers=driver).json() == []
    active = client.get("/api/v1/passengers/me/active", headers=passenger).json()
    assert active["request"]["counter_offers"] == []


def test_driver_cannot_go_below_the_minimum_fare(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9995000030", "baja@ruta.local", 20.9674, -89.5926, admin)
    _passenger, request = request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    floor = Decimal(str(request["estimated_fare"]))

    too_low = client.post(
        f"/api/v1/ride-offers/{offer['id']}/counter", headers=driver, json={"amount": float(floor - Decimal("0.01"))}
    )
    assert too_low.status_code == 400
    assert "mínima" in too_low.json()["detail"]
