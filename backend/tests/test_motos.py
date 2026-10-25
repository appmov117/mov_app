from tests.conftest import login, make_admin, ready_driver, register

TRIP = {
    "origin": {"latitude": 20.9674, "longitude": -89.5926},
    "destination": {"latitude": 20.99, "longitude": -89.63},
    "origin_label": "Centro",
    "destination_label": "Destino",
}


def passenger(client) -> dict:
    register(client, "passenger", "9996000001", "moto-pax@ruta.local")
    return login(client, "moto-pax@ruta.local")


def offers(client, headers) -> list:
    return client.get("/api/v1/drivers/me/ride-offers", headers=headers).json()


def test_moto_request_only_reaches_moto_drivers(client):
    admin = make_admin(client)
    car = ready_driver(client, "9996000010", "auto@ruta.local", 20.9674, -89.5926, admin)
    moto = ready_driver(client, "9996000011", "moto@ruta.local", 20.9675, -89.5927, admin, kind="moto")
    response = client.post("/api/v1/ride-requests", headers=passenger(client), json=TRIP | {"service": "moto"})
    assert response.status_code == 200, response.text
    assert response.json()["service"] == "moto"

    assert offers(client, car) == []
    received = offers(client, moto)
    assert len(received) == 1
    assert received[0]["service"] == "moto"


def test_car_request_skips_moto_drivers_and_package_reaches_both(client):
    admin = make_admin(client)
    car = ready_driver(client, "9996000020", "auto2@ruta.local", 20.9674, -89.5926, admin)
    moto = ready_driver(client, "9996000021", "moto2@ruta.local", 20.9675, -89.5927, admin, kind="moto")
    headers = passenger(client)
    created = client.post("/api/v1/ride-requests", headers=headers, json=TRIP).json()
    assert len(offers(client, car)) == 1
    assert offers(client, moto) == []

    client.post(f"/api/v1/ride-requests/{created['id']}/cancel", headers=headers)
    client.post("/api/v1/ride-requests", headers=headers, json=TRIP | {"service": "paquete"})
    assert len(offers(client, car)) == 1
    assert len(offers(client, moto)) == 1


def test_admin_tariffs_change_the_estimate(client):
    admin = make_admin(client)
    headers = passenger(client)
    assert client.get("/api/v1/admin/tariffs", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/tariffs", headers=admin).json() == {
        "auto": {"base": 20.0, "per_km": 6.0},
        "moto": {"base": 15.0, "per_km": 4.0},
    }
    bad = {"auto": {"base": 20, "per_km": 0}, "moto": {"base": 10, "per_km": 3}}
    assert client.put("/api/v1/admin/tariffs", headers=admin, json=bad).status_code == 422

    new = {"auto": {"base": 30, "per_km": 10}, "moto": {"base": 10, "per_km": 3}}
    assert client.put("/api/v1/admin/tariffs", headers=admin, json=new).status_code == 200
    estimate = client.post("/api/v1/ride-requests/estimate", headers=headers, json=TRIP).json()
    km = estimate["distance_m"] / 1000
    assert estimate["fare"] == round(30 + km * 10, 2)
    assert estimate["moto_fare"] == round(10 + km * 3, 2)
    assert client.get("/api/v1/meta").json()["tariffs"]["moto"] == {"base": 10.0, "per_km": 3.0}


def test_admin_moto_section_lists_moto_drivers_and_rides(client):
    admin = make_admin(client)
    ready_driver(client, "9996000030", "auto3@ruta.local", 20.9674, -89.5926, admin)
    moto = ready_driver(client, "9996000031", "moto3@ruta.local", 20.9675, -89.5927, admin, kind="moto")
    client.post("/api/v1/ride-requests", headers=passenger(client), json=TRIP | {"service": "moto"})
    assert client.post(f"/api/v1/ride-offers/{offers(client, moto)[0]['id']}/accept", headers=moto).status_code == 200

    overview = client.get("/api/v1/admin/motos", headers=admin).json()
    assert [row["name"] for row in overview["drivers"]] == ["moto3"]
    assert overview["online"] == 1
    rides = client.get("/api/v1/admin/rides?service=moto", headers=admin).json()
    assert len(rides) == 1 and rides[0]["service"] == "moto"
    assert client.get("/api/v1/admin/rides?service=auto", headers=admin).json() == []
