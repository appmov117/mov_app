from tests.conftest import login, make_admin, ready_driver, register

# Centro de Mérida y dos puntos de referencia: uno a ~1.5 km al norte y otro a ~6 km al sur.
CENTRO = {"latitude": 20.9674, "longitude": -89.5926}
NORTE = {"latitude": 20.9810, "longitude": -89.5926}
SUR = {"latitude": 20.9130, "longitude": -89.5926}


def passenger(client) -> dict:
    register(client, "passenger", "9993000001", "zona-pax@ruta.local")
    return login(client, "zona-pax@ruta.local")


def ask(client, headers, origin: dict, destination: dict) -> dict:
    response = client.post("/api/v1/ride-requests", headers=headers, json={"origin": origin, "destination": destination})
    assert response.status_code == 200, response.text
    return response.json()


def offers(client, headers) -> list:
    return client.get("/api/v1/drivers/me/ride-offers", headers=headers).json()


def cancel(client, headers, request: dict) -> None:
    client.post(f"/api/v1/ride-requests/{request['id']}/cancel", headers=headers)


def test_zone_is_saved_validated_and_toggled(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000010", "zona1@ruta.local", CENTRO["latitude"], CENTRO["longitude"], admin)
    assert client.get("/api/v1/drivers/me/work-zone", headers=driver).json() is None
    assert client.patch("/api/v1/drivers/me/work-zone", headers=driver, json={"active": True}).status_code == 409
    too_big = CENTRO | {"radius_m": 20000}
    assert client.put("/api/v1/drivers/me/work-zone", headers=driver, json=too_big).status_code == 422

    saved = client.put("/api/v1/drivers/me/work-zone", headers=driver, json=CENTRO | {"radius_m": 3000}).json()
    assert saved == {"latitude": 20.9674, "longitude": -89.5926, "radius_m": 3000, "active": True}
    off = client.patch("/api/v1/drivers/me/work-zone", headers=driver, json={"active": False}).json()
    assert off["active"] is False and off["radius_m"] == 3000


def test_inside_the_zone_only_trips_that_start_there(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000020", "zona2@ruta.local", CENTRO["latitude"], CENTRO["longitude"], admin)
    client.put("/api/v1/drivers/me/work-zone", headers=driver, json=CENTRO | {"radius_m": 1000})
    headers = passenger(client)

    outside = ask(client, headers, NORTE, CENTRO)
    assert offers(client, driver) == []
    cancel(client, headers, outside)

    ask(client, headers, CENTRO, SUR)
    assert len(offers(client, driver)) == 1


def test_outside_the_zone_only_trips_that_bring_the_driver_closer(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000030", "zona3@ruta.local", NORTE["latitude"], NORTE["longitude"], admin)
    client.put("/api/v1/drivers/me/work-zone", headers=driver, json=SUR | {"radius_m": 1000})
    headers = passenger(client)

    away = ask(client, headers, NORTE, {"latitude": 21.0100, "longitude": -89.5926})
    assert offers(client, driver) == []
    cancel(client, headers, away)

    ask(client, headers, NORTE, CENTRO)
    assert len(offers(client, driver)) == 1


def test_inactive_zone_receives_everything(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000040", "zona4@ruta.local", CENTRO["latitude"], CENTRO["longitude"], admin)
    client.put("/api/v1/drivers/me/work-zone", headers=driver, json=SUR | {"radius_m": 1000, "active": False})
    ask(client, passenger(client), NORTE, {"latitude": 21.0100, "longitude": -89.5926})
    assert len(offers(client, driver)) == 1
