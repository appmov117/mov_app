from app.db.session import SessionLocal
from app.notifications.models import Notification
from app.users.models import User
from sqlalchemy import select
from tests.conftest import login, make_admin, ready_driver
from tests.test_flow import register_passenger, trip


def _ride(client, admin: dict) -> tuple[dict, dict, str]:
    driver = ready_driver(client, "9996000001", "panel@ruta.local", 20.9674, -89.5926, admin)
    register_passenger(client)
    passenger = login(client, "pax@ruta.local")
    assert client.post("/api/v1/ride-requests", headers=passenger, json=trip()).status_code == 200
    offer_id = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]["id"]
    ride_id = client.post(f"/api/v1/ride-offers/{offer_id}/accept", headers=driver).json()["id"]
    return driver, passenger, ride_id


def _finish(client, driver: dict, ride_id: str) -> None:
    for step in ("arriving", "arrived", "start"):
        assert client.post(f"/api/v1/rides/{ride_id}/{step}", headers=driver).status_code == 200
    done = client.post(
        f"/api/v1/rides/{ride_id}/complete", headers=driver, json={"fare_amount": 60, "payment_method": "cash"}
    )
    assert done.status_code == 200, done.text


def _notifications(email: str) -> list[str]:
    db = SessionLocal()
    try:
        user_id = db.scalar(select(User.id).where(User.email == email))
        return list(db.scalars(select(Notification.title).where(Notification.user_id == user_id)).all())
    finally:
        db.close()


def test_only_admin_and_owner_can_open_uploaded_files(client):
    admin = make_admin(client)
    driver, passenger, _ride_id = _ride(client, admin)
    uploaded = client.post(
        "/api/v1/drivers/me/documents",
        headers=driver,
        data={"kind": "license"},
        files={"file": ("licencia.png", b"\x89PNG fake", "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    file_url = client.get("/api/v1/drivers/me/documents", headers=driver).json()[0]["file_url"]

    assert client.get(f"/api/v1/files/{file_url}", headers=passenger).status_code == 404
    assert client.get(f"/api/v1/files/{file_url}", headers=driver).status_code == 200
    assert client.get(f"/api/v1/files/{file_url}", headers=admin).status_code == 200


def test_document_review_requires_reason_to_reject_and_notifies(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9996000002", "docs@ruta.local", 20.9674, -89.5926, admin)
    client.post(
        "/api/v1/drivers/me/documents",
        headers=driver,
        data={"kind": "identity"},
        files={"file": ("ine.jpg", b"jpeg", "image/jpeg")},
    )
    pending = client.get("/api/v1/admin/documents?status=pending", headers=admin).json()
    assert [item["label"] for item in pending] == ["Identificación oficial"]
    url = f"/api/v1/admin/documents/{pending[0]['id']}"

    assert client.post(url, headers=admin, json={"status": "rejected"}).status_code == 400
    rejected = client.post(url, headers=admin, json={"status": "rejected", "note": "La foto está borrosa"})
    assert rejected.status_code == 200
    assert rejected.json()["note"] == "La foto está borrosa"
    assert "Identificación oficial rechazado" in _notifications("docs@ruta.local")


def test_driver_reports_passenger_and_admin_resolves(client):
    admin = make_admin(client)
    driver, _passenger, ride_id = _ride(client, admin)
    _finish(client, driver, ride_id)

    bad = client.post(f"/api/v1/rides/{ride_id}/complaints", headers=driver, json={"category": "driving"})
    assert bad.status_code == 400
    sent = client.post(
        f"/api/v1/rides/{ride_id}/complaints", headers=driver, json={"category": "no_show", "description": "No llegó"}
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["author_role"] == "driver"
    assert len(client.get("/api/v1/drivers/me/complaints", headers=driver).json()) == 1

    listed = client.get("/api/v1/admin/complaints?author_role=driver", headers=admin).json()
    assert len(listed) == 1
    assert listed[0]["passenger"]["name"] == "pax"
    assert listed[0]["destination_label"] == "García Ginerés"
    resolved = client.post(f"/api/v1/admin/complaints/{listed[0]['id']}", headers=admin, json={"status": "resolved"})
    assert resolved.status_code == 200
    assert "Revisamos tu reporte" in _notifications("panel@ruta.local")


def test_live_view_rides_and_heatmap(client):
    admin = make_admin(client)
    _driver, _passenger, ride_id = _ride(client, admin)

    live = client.get("/api/v1/admin/live", headers=admin).json()
    assert [ride["id"] for ride in live["rides"]] == [ride_id]
    assert live["rides"][0]["driver_location"] is not None
    assert live["drivers"][0]["plate"]

    active = client.get("/api/v1/admin/rides?status=active", headers=admin).json()
    assert active[0]["passenger"]["name"] == "pax"
    detail = client.get(f"/api/v1/admin/rides/{ride_id}", headers=admin).json()
    assert detail["passenger"]["phone"] == "9992000001"
    assert detail["events"][0]["type"] == "ride_accepted"

    heat = client.get("/api/v1/admin/heatmap?days=7&kind=demand", headers=admin).json()
    assert heat["total"] == 1
    assert heat["features"][0]["properties"]["count"] == 1
    assert len(heat["features"][0]["geometry"]["coordinates"][0]) == 7
    assert client.get("/api/v1/admin/heatmap?days=0", headers=admin).status_code == 400


def test_feedback_memberships_and_broadcast(client):
    admin = make_admin(client)
    driver, passenger, ride_id = _ride(client, admin)
    _finish(client, driver, ride_id)
    client.post(f"/api/v1/rides/{ride_id}/rating", headers=passenger, json={"rating": 4, "comment": "Muy amable"})

    opinions = client.get("/api/v1/admin/feedback?author_role=passenger", headers=admin).json()
    assert opinions["average_by_passengers"] == 4
    assert opinions["items"][0]["comment"] == "Muy amable"

    overview = client.get("/api/v1/admin/memberships", headers=admin).json()
    assert overview["active"] == 1
    assert overview["revenue_month"] == 200

    sent = client.post(
        "/api/v1/admin/notifications",
        headers=admin,
        json={"audience": "drivers", "title": "Mantenimiento", "body": "La app se actualiza a las 2 a.m."},
    )
    assert sent.json() == {"audience": "drivers", "count": 1}
    assert "Mantenimiento" in _notifications("panel@ruta.local")
    assert "Mantenimiento" not in _notifications("pax@ruta.local")
    assert client.get("/api/v1/admin/notifications", headers=admin).json()[0]["count"] == 1
    assert client.get("/api/v1/admin/notifications", headers=passenger).status_code == 403
