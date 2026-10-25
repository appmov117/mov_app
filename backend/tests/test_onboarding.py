from app.db.session import SessionLocal
from app.drivers import onboarding
from app.notifications.models import Notification
from sqlalchemy import select, text
from tests.conftest import login, register

TRIP = {
    "origin": {"latitude": 20.9674, "longitude": -89.5926},
    "destination": {"latitude": 20.99, "longitude": -89.63},
}


def new_driver(client, phone: str, email: str) -> tuple[dict, str]:
    register(client, "driver", phone, email, vehicle=True)
    headers = login(client, email)
    return headers, client.get("/api/v1/drivers/me", headers=headers).json()["id"]


def age_driver(driver_id: str, days: int) -> None:
    db = SessionLocal()
    db.execute(
        text("UPDATE drivers SET created_at = NOW() - make_interval(days => :days) WHERE id = :id"),
        {"days": days, "id": driver_id},
    )
    db.commit()
    db.close()


def reminders(email: str) -> list[str]:
    db = SessionLocal()
    rows = db.execute(
        text(
            "SELECT n.data->>'reminder' FROM notifications n JOIN users u ON u.id = n.user_id "
            "WHERE u.email = :email AND n.data ? 'reminder' ORDER BY n.created_at"
        ),
        {"email": email},
    ).scalars().all()
    db.close()
    return list(rows)


def review() -> None:
    onboarding._last_review = None
    db = SessionLocal()
    onboarding.review_documents(db)
    db.commit()
    db.close()


def test_new_driver_gets_six_free_months_and_works_without_approval(client):
    headers, _ = new_driver(client, "9998000001", "nuevo@ruta.local")
    membership = client.get("/api/v1/drivers/me/membership", headers=headers).json()
    assert membership["status"] == "active"
    assert membership["days_remaining"] == 180
    assert client.post("/api/v1/drivers/me/online", headers=headers).status_code == 200
    client.put("/api/v1/drivers/me/location", headers=headers, json={"latitude": 20.9674, "longitude": -89.5926})

    register(client, "passenger", "9998000002", "pax-nuevo@ruta.local")
    client.post("/api/v1/ride-requests", headers=login(client, "pax-nuevo@ruta.local"), json=TRIP)
    assert len(client.get("/api/v1/drivers/me/ride-offers", headers=headers).json()) == 1

    db = SessionLocal()
    titles = db.scalars(select(Notification.title)).all()
    db.close()
    assert "Bienvenido a Ruta" in titles


def test_unapproved_driver_is_blocked_after_fifteen_days(client):
    headers, driver_id = new_driver(client, "9998000011", "vence-docs@ruta.local")
    assert client.post("/api/v1/drivers/me/online", headers=headers).status_code == 200
    age_driver(driver_id, 16)

    review()
    review()
    assert client.get("/api/v1/drivers/me", headers=headers).json()["driver_status"] == "offline"
    assert reminders("vence-docs@ruta.local") == ["docs-expired"]
    blocked = client.post("/api/v1/drivers/me/online", headers=headers)
    assert blocked.status_code == 403
    assert "aprobemos" in blocked.json()["detail"]

    register(client, "passenger", "9998000012", "pax-vence@ruta.local")
    client.post("/api/v1/ride-requests", headers=login(client, "pax-vence@ruta.local"), json=TRIP)
    assert client.get("/api/v1/drivers/me/ride-offers", headers=headers).json() == []


def test_reminders_on_days_ten_and_fourteen_only_while_documents_are_missing(client):
    _, driver_id = new_driver(client, "9998000021", "recuerda@ruta.local")
    review()
    assert reminders("recuerda@ruta.local") == []

    age_driver(driver_id, 10)
    review()
    review()
    assert reminders("recuerda@ruta.local") == ["docs-10"]

    age_driver(driver_id, 14)
    review()
    assert reminders("recuerda@ruta.local") == ["docs-10", "docs-14"]


def test_no_reminder_once_all_documents_are_sent(client):
    headers, driver_id = new_driver(client, "9998000031", "completo@ruta.local")
    for kind in onboarding.DOC_KINDS:
        sent = client.post(
            "/api/v1/drivers/me/documents",
            headers=headers,
            data={"kind": kind},
            files={"file": ("doc.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")},
        )
        assert sent.status_code == 200, sent.text
    age_driver(driver_id, 11)
    review()
    assert reminders("completo@ruta.local") == []
