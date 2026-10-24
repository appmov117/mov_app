import json

import pytest
from app.config.settings import settings
from app.db.session import SessionLocal
from app.notifications import push
from app.notifications.models import PushSubscription
from pydantic import SecretStr
from pywebpush import WebPushException
from sqlalchemy import select
from tests.conftest import login, make_admin, ready_driver, register

SUBSCRIPTION = {"endpoint": "https://push.example.test/abc", "p256dh": "clave", "auth": "secreto"}


@pytest.fixture
def sent(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(settings, "testing", False)
    monkeypatch.setattr(settings, "vapid_public_key", "publica")
    monkeypatch.setattr(settings, "vapid_private_key", SecretStr("privada"))
    monkeypatch.setattr(settings, "vapid_subject", "mailto:soporte@ruta.local")
    monkeypatch.setattr(push._executor, "submit", lambda fn, *args: fn(*args))
    monkeypatch.setattr(push, "webpush", lambda **kwargs: calls.append(kwargs))
    return calls


def test_driver_gets_push_when_offered_a_ride(client, sent):
    admin = make_admin(client)
    driver = ready_driver(client, "9996000010", "push-driver@ruta.local", 20.9674, -89.5926, admin)
    assert client.get("/api/v1/notifications/vapid-public").json()["public_key"] == "publica"
    assert (
        client.post("/api/v1/notifications/push", headers=driver, json=SUBSCRIPTION).status_code
        == 200
    )
    sent.clear()

    register(client, "passenger", "9996000011", "push-pax@ruta.local")
    client.post(
        "/api/v1/ride-requests",
        headers=login(client, "push-pax@ruta.local"),
        json={
            "origin": {"latitude": 20.9674, "longitude": -89.5926},
            "destination": {"latitude": 20.99, "longitude": -89.63},
            "origin_label": "Centro",
            "destination_label": "Destino",
        },
    )

    assert len(sent) == 1
    payload = json.loads(sent[0]["data"])
    assert payload["title"] == "Nuevo viaje cerca de ti"
    assert payload["url"] == "/conductor"
    assert sent[0]["headers"]["Urgency"] == "high"
    assert sent[0]["subscription_info"]["endpoint"] == SUBSCRIPTION["endpoint"]


def test_expired_subscription_is_removed(client, sent, monkeypatch):
    register(client, "passenger", "9996000020", "push-gone@ruta.local")
    headers = login(client, "push-gone@ruta.local")
    client.post("/api/v1/notifications/push", headers=headers, json=SUBSCRIPTION)

    class Gone:
        status_code = 410

    def fail(**_kwargs):
        raise WebPushException("gone", response=Gone())

    monkeypatch.setattr(push, "webpush", fail)
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    db = SessionLocal()
    push.queue(db, user_id, "Hola", "Prueba", None)
    db.commit()
    assert db.scalars(select(PushSubscription)).all() == []
    db.close()


def test_unsubscribe_only_removes_own_device(client, sent):
    register(client, "passenger", "9996000030", "push-uno@ruta.local")
    register(client, "passenger", "9996000031", "push-dos@ruta.local")
    owner = login(client, "push-uno@ruta.local")
    other = login(client, "push-dos@ruta.local")
    client.post("/api/v1/notifications/push", headers=owner, json=SUBSCRIPTION)

    endpoint = {"endpoint": SUBSCRIPTION["endpoint"]}
    client.post("/api/v1/notifications/push/remove", headers=other, json=endpoint)
    db = SessionLocal()
    assert len(db.scalars(select(PushSubscription)).all()) == 1
    db.close()

    client.post("/api/v1/notifications/push/remove", headers=owner, json=endpoint)
    db = SessionLocal()
    assert db.scalars(select(PushSubscription)).all() == []
    db.close()
