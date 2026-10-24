from app.db.session import SessionLocal
from sqlalchemy import text
from tests.conftest import login, make_admin, ready_driver, register

TRIP = {
    "origin": {"latitude": 20.9674, "longitude": -89.5926},
    "destination": {"latitude": 20.99, "longitude": -89.63},
    "origin_label": "Centro",
    "destination_label": "Paseo Montejo · Auto",
}


def test_recent_trip_reports_who_cancelled(client):
    admin = make_admin(client)
    driver = ready_driver(
        client, "9998000010", "recent-driver@ruta.local", 20.9674, -89.5926, admin
    )
    register(client, "passenger", "9998000011", "recent-pax@ruta.local")
    passenger = login(client, "recent-pax@ruta.local")
    assert client.get("/api/v1/passengers/me/recent", headers=passenger).json() is None

    client.post("/api/v1/ride-requests", headers=passenger, json=TRIP)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    ride_id = client.post(f"/api/v1/ride-offers/{offer['id']}/accept", headers=driver).json()["id"]
    assert client.get("/api/v1/passengers/me/recent", headers=passenger).json() is None

    client.post(f"/api/v1/rides/{ride_id}/cancel", headers=driver)
    recent = client.get("/api/v1/passengers/me/recent", headers=passenger).json()
    assert recent["outcome"] == "cancelled"
    assert recent["cancelled_by"] == "driver"
    assert recent["destination_label"] == "Paseo Montejo · Auto"
    assert recent["destination"] == {"latitude": 20.99, "longitude": -89.63}


def test_recent_trip_reports_passenger_cancel_and_ignores_old_ones(client):
    register(client, "passenger", "9998000020", "recent-cancel@ruta.local")
    passenger = login(client, "recent-cancel@ruta.local")
    request = client.post("/api/v1/ride-requests", headers=passenger, json=TRIP).json()
    client.post(f"/api/v1/ride-requests/{request['id']}/cancel", headers=passenger)

    recent = client.get("/api/v1/passengers/me/recent", headers=passenger).json()
    assert recent["outcome"] == "cancelled"
    assert recent["cancelled_by"] == "passenger"

    db = SessionLocal()
    db.execute(
        text("UPDATE ride_requests SET created_at = NOW() - INTERVAL '2 hours' WHERE id = :id"),
        {"id": request["id"]},
    )
    db.commit()
    db.close()
    assert client.get("/api/v1/passengers/me/recent", headers=passenger).json() is None
