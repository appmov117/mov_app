from tests.conftest import login, make_admin, ready_driver, register

START = {"latitude": 20.9674, "longitude": -89.5926}
NEAR_END = {"latitude": 20.9700, "longitude": -89.5950}
FAR_END = {"latitude": 20.9900, "longitude": -89.6200}
NEXT_PICKUP = {"latitude": 20.9710, "longitude": -89.5960}


def passenger(client, phone: str, email: str) -> dict:
    register(client, "passenger", phone, email)
    return login(client, email)


def request(client, headers: dict, origin: dict, destination: dict) -> None:
    body = {"origin": origin, "destination": destination, "origin_label": "Origen", "destination_label": "Destino"}
    response = client.post("/api/v1/ride-requests", headers=headers, json=body)
    assert response.status_code == 200, response.text


def offers(client, driver: dict) -> list[dict]:
    return client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()


def ride_in_progress(client, destination: dict) -> tuple[dict, str]:
    """Conductor con un pasajero a bordo rumbo a `destination`."""
    admin = make_admin(client)
    driver = ready_driver(client, "9995000001", "encadena@ruta.local", START["latitude"], START["longitude"], admin)
    request(client, passenger(client, "9995000002", "primero@ruta.local"), START, destination)
    ride_id = client.post(f"/api/v1/ride-offers/{offers(client, driver)[0]['id']}/accept", headers=driver).json()["id"]
    for step in ("arriving", "arrived", "start"):
        assert client.post(f"/api/v1/rides/{ride_id}/{step}", headers=driver).status_code == 200
    return driver, ride_id


def move(client, driver: dict, point: dict) -> None:
    response = client.put("/api/v1/drivers/me/location", headers=driver, json={**point, "heading": 0, "speed": 8})
    assert response.status_code == 200, response.text


def test_driver_finishing_a_ride_gets_next_offer_with_remaining_time(client):
    driver, _ = ride_in_progress(client, NEAR_END)
    move(client, driver, {"latitude": 20.9690, "longitude": -89.5940})
    request(client, passenger(client, "9995000003", "siguiente@ruta.local"), NEXT_PICKUP, FAR_END)

    [offer] = offers(client, driver)
    assert offer["after_current_ride"] is True
    # Lo que falta del viaje actual más el trayecto de su destino a la nueva recogida.
    assert offer["pickup_eta_s"] > 30


def test_driver_far_from_finishing_gets_no_offer(client):
    driver, _ = ride_in_progress(client, FAR_END)
    request(client, passenger(client, "9995000003", "siguiente@ruta.local"), {"latitude": 20.9890, "longitude": -89.6190}, START)

    assert offers(client, driver) == []


def test_chained_ride_starts_after_current_one_and_only_one_waits(client):
    driver, ride_id = ride_in_progress(client, NEAR_END)
    move(client, driver, NEAR_END)
    request(client, passenger(client, "9995000003", "siguiente@ruta.local"), NEXT_PICKUP, FAR_END)
    accepted = client.post(f"/api/v1/ride-offers/{offers(client, driver)[0]['id']}/accept", headers=driver)
    assert accepted.status_code == 200, accepted.text
    next_id = accepted.json()["id"]

    request(client, passenger(client, "9995000004", "tercero@ruta.local"), NEXT_PICKUP, START)
    assert offers(client, driver) == []

    assert client.get("/api/v1/drivers/me/active", headers=driver).json()["id"] == ride_id
    done = client.post(f"/api/v1/rides/{ride_id}/complete", headers=driver, json={"fare_amount": 40, "payment_method": "cash"})
    assert done.status_code == 200, done.text
    assert client.get("/api/v1/drivers/me/active", headers=driver).json()["id"] == next_id
    assert client.get("/api/v1/drivers/me", headers=driver).json()["driver_status"] == "busy"


def test_driver_is_available_again_after_completing_or_cancelling(client):
    driver, ride_id = ride_in_progress(client, NEAR_END)
    done = client.post(f"/api/v1/rides/{ride_id}/complete", headers=driver, json={"fare_amount": 40, "payment_method": "cash"})
    assert done.status_code == 200, done.text
    assert client.get("/api/v1/drivers/me", headers=driver).json()["driver_status"] == "online"

    request(client, passenger(client, "9995000005", "cancela@ruta.local"), START, NEAR_END)
    second = client.post(f"/api/v1/ride-offers/{offers(client, driver)[0]['id']}/accept", headers=driver).json()["id"]
    assert client.post(f"/api/v1/rides/{second}/cancel", headers=driver).status_code == 200
    assert client.get("/api/v1/drivers/me", headers=driver).json()["driver_status"] == "online"


def test_tick_releases_busy_driver_without_active_ride(client):
    from app.db.session import SessionLocal
    from app.drivers.models import Driver
    from app.rides.service import tick

    admin = make_admin(client)
    driver = ready_driver(client, "9995000006", "atorado@ruta.local", START["latitude"], START["longitude"], admin)
    driver_id = client.get("/api/v1/drivers/me", headers=driver).json()["id"]
    db = SessionLocal()
    db.get(Driver, driver_id).driver_status = "busy"
    db.commit()
    tick(db)
    db.close()
    assert client.get("/api/v1/drivers/me", headers=driver).json()["driver_status"] == "online"
