from tests.conftest import login, make_admin
from tests.test_flow import register_passenger


def _passenger(client, admin: dict) -> tuple[dict, dict]:
    register_passenger(client)
    headers = login(client, "pax@ruta.local")
    client.post(
        "/api/v1/passengers/me/places",
        headers=headers,
        json={"label": "Casa", "kind": "home", "latitude": 20.97, "longitude": -89.6},
    )
    row = next(item for item in client.get("/api/v1/admin/accounts", headers=admin).json() if item["role"] == "passenger")
    return headers, row


def test_admin_lists_passengers_and_accounts(client):
    admin = make_admin(client)
    _headers, account = _passenger(client, admin)

    passengers = client.get("/api/v1/admin/passengers", headers=admin).json()
    assert [row["name"] for row in passengers] == ["pax"]
    detail = client.get(f"/api/v1/admin/passengers/{passengers[0]['id']}", headers=admin)
    assert detail.status_code == 200, detail.text
    assert detail.json()["email"] == "pax@ruta.local"
    assert account["profile_id"] == passengers[0]["id"]


def test_suspend_closes_access_and_reactivate_restores_it(client):
    admin = make_admin(client)
    headers, account = _passenger(client, admin)

    assert client.post(f"/api/v1/admin/accounts/{account['id']}/suspend", headers=admin).status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 403
    assert client.post(f"/api/v1/admin/accounts/{account['id']}/activate", headers=admin).status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200


def test_delete_removes_personal_data_and_blocks_login(client):
    admin = make_admin(client)
    headers, account = _passenger(client, admin)

    response = client.delete(f"/api/v1/admin/accounts/{account['id']}", headers=admin)
    assert response.status_code == 200, response.text

    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    login_again = client.post("/api/v1/auth/login", json={"identifier": "pax@ruta.local", "password": "clave1234"})
    assert login_again.status_code == 401
    detail = client.get(f"/api/v1/admin/passengers/{account['profile_id']}", headers=admin).json()
    assert detail["name"] == "Cuenta eliminada"
    assert detail["email"] is None and detail["phone"] is None
    assert detail["saved_places"] == 0
    assert client.delete(f"/api/v1/admin/accounts/{account['id']}", headers=admin).status_code == 404


def test_admin_accounts_cannot_be_changed(client):
    admin = make_admin(client)
    own = next(item for item in client.get("/api/v1/admin/accounts", headers=admin).json() if item["role"] == "admin")
    assert client.delete(f"/api/v1/admin/accounts/{own['id']}", headers=admin).status_code == 400
    assert client.post(f"/api/v1/admin/accounts/{own['id']}/suspend", headers=admin).status_code == 400
