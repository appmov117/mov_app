import pytest
from app.db.session import SessionLocal
from app.drivers.models import Driver
from app.rides import repository
from app.users.models import User
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect
from tests.conftest import login, make_admin, ready_driver
from tests.test_flow import register_passenger, trip


def _token(headers: dict) -> str:
    return headers["Authorization"].split(" ", 1)[1]


def test_rejects_socket_without_valid_token(client):
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/ws/me?token=basura") as socket:
            socket.receive_json()
    assert closed.value.code == 4401


def test_driver_and_passenger_hear_about_offer_and_assignment(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9991000021", "live@ruta.local", 20.9674, -89.5926, admin)
    register_passenger(client)
    passenger = login(client, "pax@ruta.local")

    with (
        client.websocket_connect(f"/ws/me?token={_token(driver)}") as driver_socket,
        client.websocket_connect(f"/ws/me?token={_token(passenger)}") as passenger_socket,
    ):
        assert client.post("/api/v1/ride-requests", headers=passenger, json=trip()).status_code == 200
        assert driver_socket.receive_json() == {"type": "sync"}
        assert passenger_socket.receive_json() == {"type": "sync"}

        offer_id = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]["id"]
        assert client.post(f"/api/v1/ride-offers/{offer_id}/accept", headers=driver).status_code == 200
        assert passenger_socket.receive_json() == {"type": "sync"}


def test_driver_sends_location_through_socket(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9991000022", "gps@ruta.local", 20.9674, -89.5926, admin)

    with client.websocket_connect(f"/ws/me?token={_token(driver)}") as socket:
        socket.send_json({"type": "location", "data": {"latitude": 20.97, "longitude": -89.6, "heading": 90, "speed": 4}})
        socket.send_json({"type": "location", "data": {"latitude": 999, "longitude": 0}})
        socket.send_text("no es json")
        # El canal procesa en orden: el pong confirma que la ubicación ya se guardó.
        socket.send_json({"type": "ping"})
        assert socket.receive_json() == {"type": "pong"}

    db = SessionLocal()
    try:
        driver_id = db.scalar(select(Driver.id).join(User, User.id == Driver.user_id).where(User.email == "gps@ruta.local"))
        point = repository.driver_coords(db, driver_id)
    finally:
        db.close()
    assert point["latitude"] == pytest.approx(20.97)
    assert point["longitude"] == pytest.approx(-89.6)


def test_passenger_follows_driver_and_chat_on_own_channel(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9991000023", "ruta@ruta.local", 20.9674, -89.5926, admin)
    register_passenger(client)
    passenger = login(client, "pax@ruta.local")
    assert client.post("/api/v1/ride-requests", headers=passenger, json=trip()).status_code == 200
    offer_id = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]["id"]
    ride_id = client.post(f"/api/v1/ride-offers/{offer_id}/accept", headers=driver).json()["id"]

    with client.websocket_connect(f"/ws/me?token={_token(passenger)}") as socket:
        moved = client.put(
            "/api/v1/drivers/me/location",
            headers=driver,
            json={"latitude": 20.968, "longitude": -89.593, "heading": 0, "speed": 3},
        )
        assert moved.status_code == 200
        message = socket.receive_json()
        assert message["type"] == "driver_location"
        assert message["ride_id"] == ride_id

        sent = client.post(f"/api/v1/rides/{ride_id}/messages", headers=driver, json={"body": "Voy llegando"})
        assert sent.status_code == 200, sent.text
        message = socket.receive_json()
        assert message["type"] == "message"
        assert message["data"]["body"] == "Voy llegando"
