from tests.conftest import make_admin, ready_driver

LINK = "https://mpago.la/1yrVnj4"


def test_admin_sets_payment_link_and_drivers_get_it(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9997000001", "liga@ruta.local", 20.9674, -89.5926, admin)

    saved = client.put("/api/v1/admin/settings/payment-link", headers=admin, json={"url": LINK})
    assert saved.status_code == 200, saved.text
    assert client.get("/api/v1/admin/settings/payment-link", headers=admin).json()["url"] == LINK

    assert client.get("/api/v1/drivers/me/membership", headers=driver).json()["payment_url"] == LINK
    assert client.post("/api/v1/drivers/me/membership/payment", headers=driver, json={}).json()["payment_url"] == LINK
    assert client.get("/api/v1/meta").json()["payment_url"] == LINK


def test_only_admin_can_change_link_and_it_must_be_https(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9997000002", "liga2@ruta.local", 20.9674, -89.5926, admin)
    assert client.put("/api/v1/admin/settings/payment-link", headers=driver, json={"url": LINK}).status_code == 403
    for bad in ("http://mpago.la/x", "mpago.la/x", "javascript:alert(1)", ""):
        assert client.put("/api/v1/admin/settings/payment-link", headers=admin, json={"url": bad}).status_code == 400, bad


def test_driver_sees_own_payment_history_newest_first(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9997000003", "historial@ruta.local", 20.9674, -89.5926, admin)
    other = ready_driver(client, "9997000004", "otro@ruta.local", 20.9674, -89.5926, admin)
    client.post("/api/v1/drivers/me/membership/payment", headers=driver, json={})

    history = client.get("/api/v1/drivers/me/membership/payments", headers=driver)
    assert history.status_code == 200, history.text
    rows = history.json()
    assert [row["status"] for row in rows] == ["pending", "approved"]
    assert rows[0]["amount"] == 200 and rows[0]["created_at"]
    assert len(client.get("/api/v1/drivers/me/membership/payments", headers=other).json()) == 1
