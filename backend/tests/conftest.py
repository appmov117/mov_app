import os

os.environ["DATABASE_URL"] = "postgresql+psycopg://ruta:ruta@localhost:5433/ruta_test"
os.environ["SEED"] = "false"
os.environ["TESTING"] = "true"
os.environ["LOCATION_MIN_INTERVAL_S"] = "0"
os.environ["JWT_SECRET"] = "test-secret"
# Las pruebas nunca escriben en el Storage real aunque el .env tenga sus claves.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from app.db.session import SessionLocal
from fastapi.testclient import TestClient
from sqlalchemy import text


def _ensure_database() -> None:
    conn = psycopg.connect("postgresql://ruta:ruta@localhost:5433/ruta", autocommit=True)
    exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = 'ruta_test'").fetchone()
    if not exists:
        conn.execute("CREATE DATABASE ruta_test")
    conn.close()


@pytest.fixture(scope="session", autouse=True)
def migrated():
    _ensure_database()
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def clean():
    from app.core.rate_limit import reset

    reset()
    db = SessionLocal()
    db.execute(
        text(
            """
            TRUNCATE TABLE
                analytics_events, audit_logs, push_subscriptions, notifications, refresh_tokens,
                ride_messages, safety_recordings, safety_alerts,
                saved_places, favorite_drivers, driver_rewards, referrals, complaints, ratings,
                membership_payments, memberships, ride_events, rides, ride_offers, ride_requests,
                referral_codes, driver_sessions, driver_locations, driver_documents, vehicles,
                drivers, passengers, users
            RESTART IDENTITY CASCADE
            """
        )
    )
    db.commit()
    db.close()
    yield


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, role: str, phone: str, email: str, vehicle: bool = False) -> dict:
    payload = {
        "name": email.split("@")[0],
        "phone": phone,
        "email": email,
        "password": "clave1234",
        "role": role,
    }
    if vehicle:
        payload["vehicle"] = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2021,
            "color": "Blanco",
            "plate": phone[-6:],
        }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def login(client: TestClient, email: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"identifier": email, "password": "clave1234"})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_admin(client: TestClient) -> dict:
    from app.core.security import hash_password
    from app.users.models import User

    db = SessionLocal()
    db.add(
        User(
            name="Admin",
            phone="9990000099",
            email="admin-test@ruta.local",
            password_hash=hash_password("clave1234"),
            role="admin",
            status="active",
        )
    )
    db.commit()
    db.close()
    return login(client, "admin-test@ruta.local")


def ready_driver(client: TestClient, phone: str, email: str, lat: float, lng: float, admin: dict) -> dict:
    register(client, "driver", phone, email, vehicle=True)
    headers = login(client, email)
    driver_id = client.get("/api/v1/drivers/me", headers=headers).json()["id"]
    assert client.post(f"/api/v1/admin/drivers/{driver_id}/activate", headers=admin).status_code == 200
    payment = client.post("/api/v1/drivers/me/membership/payment", headers=headers, json={})
    assert payment.status_code == 200, payment.text
    assert client.post(f"/api/v1/admin/payments/{payment.json()['payment_id']}/approve", headers=admin).status_code == 200
    assert client.post("/api/v1/drivers/me/online", headers=headers).status_code == 200, "online"
    located = client.put(
        "/api/v1/drivers/me/location",
        headers=headers,
        json={"latitude": lat, "longitude": lng, "heading": 10, "speed": 0},
    )
    assert located.status_code == 200, located.text
    return headers
