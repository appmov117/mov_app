import uuid

import pytest
from app.core import storage
from app.safety import service as safety_service
from tests.conftest import login, make_admin, ready_driver, register


@pytest.fixture
def recordings_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    return tmp_path


def start_ride(client) -> tuple[dict, dict, dict, str]:
    admin = make_admin(client)
    driver = ready_driver(
        client, "9994000010", "safety-driver@ruta.local", 20.9674, -89.5926, admin
    )
    register(client, "passenger", "9994000011", "safety-pax@ruta.local")
    passenger = login(client, "safety-pax@ruta.local")
    client.post(
        "/api/v1/ride-requests",
        headers=passenger,
        json={
            "origin": {"latitude": 20.9674, "longitude": -89.5926},
            "destination": {"latitude": 20.99, "longitude": -89.63},
            "origin_label": "Centro",
            "destination_label": "Destino",
        },
    )
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    ride_id = client.post(f"/api/v1/ride-offers/{offer['id']}/accept", headers=driver).json()["id"]
    return admin, driver, passenger, ride_id


def upload(client, headers, ride_id, kind="audio", mime="audio/webm", content=b"datos", segment=0):
    return client.post(
        f"/api/v1/rides/{ride_id}/safety/recordings",
        headers=headers,
        data={"kind": kind, "session_id": str(uuid.uuid4()), "segment": str(segment)},
        files={"file": (f"clip.{mime.split('/')[1]}", content, mime)},
    )


def test_panic_alert_reaches_admin_with_location(client):
    admin, _driver, passenger, ride_id = start_ride(client)

    created = client.post(
        f"/api/v1/rides/{ride_id}/safety/alerts",
        headers=passenger,
        json={"latitude": 20.97, "longitude": -89.6},
    )
    assert created.status_code == 200, created.text
    assert created.json()["status"] == "open"
    assert created.json()["location"] == pytest.approx({"latitude": 20.97, "longitude": -89.6})

    alerts = client.get("/api/v1/admin/safety/alerts", headers=admin).json()
    assert len(alerts) == 1
    assert alerts[0]["passenger"]["name"]
    assert alerts[0]["driver"]["name"]

    notes = client.get("/api/v1/notifications", headers=admin).json()
    assert any(note["title"] == "Alerta de pánico" for note in notes)

    attended = client.post(f"/api/v1/admin/safety/alerts/{alerts[0]['id']}/attend", headers=admin)
    assert attended.json()["status"] == "attended"


def test_alert_without_coordinates_uses_driver_location(client):
    _admin, _driver, passenger, ride_id = start_ride(client)

    created = client.post(f"/api/v1/rides/{ride_id}/safety/alerts", headers=passenger, json={})
    assert created.status_code == 200, created.text
    assert created.json()["location"] == pytest.approx({"latitude": 20.9674, "longitude": -89.5926})


def test_only_the_ride_passenger_can_raise_alerts(client):
    _admin, driver, _passenger, ride_id = start_ride(client)
    register(client, "passenger", "9994000012", "otro-pax@ruta.local")
    other = login(client, "otro-pax@ruta.local")

    assert (
        client.post(f"/api/v1/rides/{ride_id}/safety/alerts", headers=other, json={}).status_code
        == 404
    )
    assert (
        client.post(f"/api/v1/rides/{ride_id}/safety/alerts", headers=driver, json={}).status_code
        == 403
    )


def test_recording_is_stored_and_only_admin_can_download(client, recordings_dir):
    admin, _driver, passenger, ride_id = start_ride(client)

    saved = upload(client, passenger, ride_id, content=b"audio-bytes")
    assert saved.status_code == 200, saved.text
    assert saved.json()["kind"] == "audio"
    assert list((recordings_dir / "recordings").iterdir())

    rows = client.get("/api/v1/admin/safety/recordings", headers=admin).json()
    assert rows[0]["id"] == saved.json()["id"]
    file_url = f"/api/v1/admin/safety/recordings/{rows[0]['id']}/file"
    assert client.get(file_url, headers=admin).content == b"audio-bytes"
    assert client.get(file_url, headers=passenger).status_code == 403


def test_recording_rejects_wrong_type_and_oversize(client, recordings_dir, monkeypatch):
    _admin, _driver, passenger, ride_id = start_ride(client)

    assert upload(client, passenger, ride_id, mime="text/plain").status_code == 400
    assert upload(client, passenger, ride_id, kind="video", mime="audio/webm").status_code == 400

    monkeypatch.setitem(safety_service.MAX_BYTES, "audio", 4)
    assert upload(client, passenger, ride_id, content=b"demasiado").status_code == 413
    assert not list(recordings_dir.rglob("*.*"))
