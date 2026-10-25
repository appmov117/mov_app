from decimal import Decimal
from threading import Thread
from uuid import UUID

from app.core.errors import AppError
from app.db.session import SessionLocal
from app.rides.pricing import fare
from app.rides.service import accept_offer
from app.users.models import User
from sqlalchemy import select, text
from tests.conftest import login, make_admin, ready_driver, register


def test_fare_is_base_plus_distance():
    db = SessionLocal()
    assert fare(db, "auto", 8000) == Decimal("68.00")
    assert fare(db, "moto", 8000) == Decimal("47.00")
    assert fare(db, "paquete", 8000) == Decimal("47.60")
    db.close()


def test_passenger_cannot_open_two_rides(client):
    admin = make_admin(client)
    ready_driver(client, "9991000008", "cerca@ruta.local", 20.9674, -89.5926, admin)
    register_passenger(client)
    headers = login(client, "pax@ruta.local")
    body = trip()
    first = client.post("/api/v1/ride-requests", headers=headers, json=body)
    assert first.status_code == 200, first.text
    assert first.json()["status"] in {"searching", "offered"}
    again = client.post("/api/v1/ride-requests", headers=headers, json=body)
    assert again.status_code == 409


def test_expired_membership_cannot_go_online_or_receive_offers(client):
    admin = make_admin(client)
    active = ready_driver(client, "9991000001", "activo@ruta.local", 20.9674, -89.5926, admin)
    register(client, "driver", "9991000002", "vencido@ruta.local", vehicle=True)
    expired = login(client, "vencido@ruta.local")
    driver_id = client.get("/api/v1/drivers/me", headers=expired).json()["id"]
    client.post(f"/api/v1/admin/drivers/{driver_id}/activate", headers=admin)
    db = SessionLocal()
    db.execute(
        text("UPDATE memberships SET expires_at = NOW() - INTERVAL '1 day' WHERE driver_id = :id"), {"id": driver_id}
    )
    db.commit()
    db.close()
    client.put(
        "/api/v1/drivers/me/location",
        headers=expired,
        json={"latitude": 20.9674, "longitude": -89.5926},
    )
    assert client.post("/api/v1/drivers/me/online", headers=expired).status_code == 403
    register_passenger(client)
    response = client.post("/api/v1/ride-requests", headers=login(client, "pax@ruta.local"), json=trip())
    assert response.status_code == 200
    offers = client.get("/api/v1/drivers/me/ride-offers", headers=active).json()
    assert len(offers) == 1
    assert client.get("/api/v1/drivers/me/ride-offers", headers=expired).json() == []


def test_only_one_driver_can_accept(client):
    admin = make_admin(client)
    first = ready_driver(client, "9991000011", "uno@ruta.local", 20.9674, -89.5926, admin)
    second = ready_driver(client, "9991000012", "dos@ruta.local", 20.9680, -89.5930, admin)
    register_passenger(client)
    response = client.post("/api/v1/ride-requests", headers=login(client, "pax@ruta.local"), json=trip())
    assert response.status_code == 200, response.text
    offer_a = client.get("/api/v1/drivers/me/ride-offers", headers=first).json()[0]["id"]
    offer_b = client.get("/api/v1/drivers/me/ride-offers", headers=second).json()[0]["id"]
    codes: list[int] = []

    def accept(email: str, offer_id: str):
        db = SessionLocal()
        try:
            user = db.scalar(select(User).where(User.email == email))
            try:
                accept_offer(db, user, UUID(offer_id))
                codes.append(200)
            except AppError as exc:
                codes.append(exc.status_code)
        finally:
            db.close()

    threads = [
        Thread(target=accept, args=("uno@ruta.local", offer_a)),
        Thread(target=accept, args=("dos@ruta.local", offer_b)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(codes) == [200, 409]


def test_busy_driver_cannot_accept_another_ride(client):
    admin = make_admin(client)
    headers = ready_driver(client, "9991000021", "ocupado@ruta.local", 20.9674, -89.5926, admin)
    register_passenger(client)
    passenger = login(client, "pax@ruta.local")
    assert client.post("/api/v1/ride-requests", headers=passenger, json=trip()).status_code == 200
    offer_id = client.get("/api/v1/drivers/me/ride-offers", headers=headers).json()[0]["id"]
    assert client.post(f"/api/v1/ride-offers/{offer_id}/accept", headers=headers).status_code == 200
    other = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Otro",
            "phone": "9993330008",
            "email": "otro@ruta.local",
            "password": "clave1234",
            "role": "passenger",
        },
    )
    assert other.status_code == 200
    other_headers = {
        "Authorization": f"Bearer {client.post('/api/v1/auth/login', json={'identifier': 'otro@ruta.local', 'password': 'clave1234'}).json()['access_token']}"
    }
    second = client.post("/api/v1/ride-requests", headers=other_headers, json=trip())
    assert second.status_code == 200
    assert client.get("/api/v1/drivers/me/ride-offers", headers=headers).json() == []


def test_completed_ride_cannot_be_completed_twice_and_skips_invalid_states(client):
    admin = make_admin(client)
    headers = ready_driver(client, "9991000031", "flujo@ruta.local", 20.9674, -89.5926, admin)
    register_passenger(client)
    passenger = login(client, "pax@ruta.local")
    client.post("/api/v1/ride-requests", headers=passenger, json=trip())
    offer_id = client.get("/api/v1/drivers/me/ride-offers", headers=headers).json()[0]["id"]
    ride = client.post(f"/api/v1/ride-offers/{offer_id}/accept", headers=headers).json()
    ride_id = ride["id"]
    assert client.post(f"/api/v1/rides/{ride_id}/start", headers=headers).status_code == 409
    assert client.post(f"/api/v1/rides/{ride_id}/arriving", headers=headers).status_code == 200
    assert client.post(f"/api/v1/rides/{ride_id}/arrived", headers=headers).status_code == 200
    assert client.post(f"/api/v1/rides/{ride_id}/start", headers=headers).status_code == 200
    # Un segundo toque en "Iniciar viaje" con la red lenta no debe mostrar error.
    repeated = client.post(f"/api/v1/rides/{ride_id}/start", headers=headers)
    assert repeated.status_code == 200 and repeated.json()["status"] == "in_progress"
    done = client.post(
        f"/api/v1/rides/{ride_id}/complete",
        headers=headers,
        json={"fare_amount": 105, "payment_method": "cash"},
    )
    assert done.status_code == 200, done.text
    assert done.json()["fare_amount"] == 105
    assert done.json()["payment_method"] == "cash"
    again = client.post(
        f"/api/v1/rides/{ride_id}/complete",
        headers=headers,
        json={"fare_amount": 105, "payment_method": "cash"},
    )
    assert again.status_code == 409
    rated = client.post(
        f"/api/v1/rides/{ride_id}/rating",
        headers=passenger,
        json={"rating": 5, "comment": "Buen servicio"},
    )
    assert rated.status_code == 200
    history = client.get("/api/v1/passengers/me/rides", headers=passenger)
    assert history.json()[0]["status"] == "completed"


def register_passenger(client):
    register(client, "passenger", "9992000001", "pax@ruta.local")


def trip():
    return {
        "origin": {"latitude": 20.9674, "longitude": -89.5926},
        "destination": {"latitude": 20.99, "longitude": -89.62},
        "origin_label": "Centro",
        "destination_label": "García Ginerés",
    }



def test_driver_with_stale_location_gets_no_offers(client):
    from app.db.session import SessionLocal
    from sqlalchemy import text

    admin = make_admin(client)
    stale = ready_driver(client, "9991000031", "viejo@ruta.local", 20.9674, -89.5926, admin)
    fresh = ready_driver(client, "9991000032", "fresco@ruta.local", 20.9680, -89.5930, admin)
    stale_id = client.get("/api/v1/drivers/me", headers=stale).json()["id"]
    db = SessionLocal()
    db.execute(
        text("UPDATE driver_locations SET updated_at = NOW() - INTERVAL '1 hour' WHERE driver_id = :id"),
        {"id": stale_id},
    )
    db.commit()
    db.close()

    register_passenger(client)
    response = client.post("/api/v1/ride-requests", headers=login(client, "pax@ruta.local"), json=trip())
    assert response.status_code == 200, response.text

    assert client.get("/api/v1/drivers/me/ride-offers", headers=stale).json() == []
    assert len(client.get("/api/v1/drivers/me/ride-offers", headers=fresh).json()) == 1
