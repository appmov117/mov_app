from tests.conftest import login, make_admin, ready_driver, register


def test_passenger_can_manage_saved_places(client):
    register(client, "passenger", "9993000001", "lugares@ruta.local")
    headers = login(client, "lugares@ruta.local")

    assert client.get("/api/v1/passengers/me/places", headers=headers).json() == []

    created = client.post(
        "/api/v1/passengers/me/places",
        headers=headers,
        json={
            "label": "Parque de las Américas",
            "kind": "other",
            "latitude": 20.987,
            "longitude": -89.636,
        },
    )
    assert created.status_code == 200, created.text
    place = created.json()

    listed = client.get("/api/v1/passengers/me/places", headers=headers)
    assert listed.status_code == 200
    assert listed.json() == [place]

    removed = client.delete(f"/api/v1/passengers/me/places/{place['id']}", headers=headers)
    assert removed.status_code == 200
    assert client.get("/api/v1/passengers/me/places", headers=headers).json() == []


def test_driver_advances_ordered_stops_manually(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000002", "paradas-driver@ruta.local", 20.9674, -89.5926, admin)
    register(client, "passenger", "9993000003", "paradas@ruta.local")
    passenger = login(client, "paradas@ruta.local")
    stops = [
        {"latitude": 20.975, "longitude": -89.61},
        {"latitude": 20.982, "longitude": -89.62},
    ]
    requested = client.post(
        "/api/v1/ride-requests",
        headers=passenger,
        json={
            "origin": {"latitude": 20.9674, "longitude": -89.5926},
            "destination": {"latitude": 20.99, "longitude": -89.63},
            "stops": stops,
            "origin_label": "Centro",
            "destination_label": "Destino",
        },
    )
    assert requested.status_code == 200, requested.text
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    ride = client.post(f"/api/v1/ride-offers/{offer['id']}/accept", headers=driver).json()
    ride_id = ride["id"]
    client.post(f"/api/v1/rides/{ride_id}/arriving", headers=driver)
    client.post(f"/api/v1/rides/{ride_id}/arrived", headers=driver)
    started = client.post(f"/api/v1/rides/{ride_id}/start", headers=driver)
    assert started.status_code == 200
    assert started.json()["stops"] == stops
    assert started.json()["current_stop_index"] == 0
    assert started.json()["next_stop"] == stops[0]

    arrived = client.post(f"/api/v1/rides/{ride_id}/stops/arrived", headers=driver)
    assert arrived.status_code == 200
    assert arrived.json()["stop_arrived"] is True

    continued = client.post(f"/api/v1/rides/{ride_id}/stops/continue", headers=driver)
    assert continued.status_code == 200
    assert continued.json()["current_stop_index"] == 1
    assert continued.json()["next_stop"] == stops[1]
    assert continued.json()["stop_arrived"] is False

    client.post(f"/api/v1/rides/{ride_id}/stops/arrived", headers=driver)
    final_leg = client.post(f"/api/v1/rides/{ride_id}/stops/continue", headers=driver)
    assert final_leg.status_code == 200
    assert final_leg.json()["current_stop_index"] == 2
    assert final_leg.json()["next_stop"] is None


def test_stop_guards_block_invalid_progress(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000004", "guardas-driver@ruta.local", 20.9674, -89.5926, admin)
    register(client, "passenger", "9993000005", "guardas@ruta.local")
    passenger = login(client, "guardas@ruta.local")
    stops = [{"latitude": 20.975, "longitude": -89.61}]
    requested = client.post(
        "/api/v1/ride-requests",
        headers=passenger,
        json={
            "origin": {"latitude": 20.9674, "longitude": -89.5926},
            "destination": {"latitude": 20.99, "longitude": -89.63},
            "stops": stops,
            "origin_label": "Centro",
            "destination_label": "Destino",
        },
    )
    assert requested.status_code == 200, requested.text
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    assert offer["stops"] == stops
    assert offer["stop_count"] == 1
    ride_id = client.post(f"/api/v1/ride-offers/{offer['id']}/accept", headers=driver).json()["id"]
    client.post(f"/api/v1/rides/{ride_id}/arriving", headers=driver)
    client.post(f"/api/v1/rides/{ride_id}/arrived", headers=driver)
    client.post(f"/api/v1/rides/{ride_id}/start", headers=driver)

    assert client.post(f"/api/v1/rides/{ride_id}/stops/continue", headers=driver).status_code == 409
    assert client.post(
        f"/api/v1/rides/{ride_id}/complete",
        headers=driver,
        json={"fare_amount": 80, "payment_method": "cash"},
    ).status_code == 409

    arrived = client.post(f"/api/v1/rides/{ride_id}/stops/arrived", headers=driver)
    assert arrived.status_code == 200
    assert client.post(f"/api/v1/rides/{ride_id}/stops/arrived", headers=driver).status_code == 409

    continued = client.post(f"/api/v1/rides/{ride_id}/stops/continue", headers=driver)
    assert continued.status_code == 200
    assert continued.json()["next_stop"] is None

    completed = client.post(
        f"/api/v1/rides/{ride_id}/complete",
        headers=driver,
        json={"fare_amount": 80, "payment_method": "cash"},
    )
    assert completed.status_code == 200


def test_both_sides_get_invoice_and_can_rate(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9993000010", "invoice-driver@ruta.local", 20.9674, -89.5926, admin)
    register(client, "passenger", "9993000011", "invoice-pax@ruta.local")
    passenger = login(client, "invoice-pax@ruta.local")
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
    client.post(f"/api/v1/rides/{ride_id}/arriving", headers=driver)
    client.post(f"/api/v1/rides/{ride_id}/arrived", headers=driver)
    client.post(f"/api/v1/rides/{ride_id}/start", headers=driver)
    done = client.post(
        f"/api/v1/rides/{ride_id}/complete",
        headers=driver,
        json={"fare_amount": 116, "payment_method": "cash"},
    )
    assert done.status_code == 200, done.text

    driver_active = client.get("/api/v1/drivers/me/active", headers=driver)
    assert driver_active.status_code == 200
    assert driver_active.json()["id"] == ride_id
    assert driver_active.json()["status"] == "completed"
    assert driver_active.json()["fare_amount"] == 116

    passenger_active = client.get("/api/v1/passengers/me/active", headers=passenger)
    assert passenger_active.status_code == 200
    assert passenger_active.json()["ride"]["id"] == ride_id
    assert passenger_active.json()["ride"]["status"] == "completed"

    pax_rate = client.post(
        f"/api/v1/rides/{ride_id}/rating",
        headers=passenger,
        json={"rating": 5, "comment": "Excelente viaje"},
    )
    assert pax_rate.status_code == 200, pax_rate.text
    assert pax_rate.json()["passenger_rating"]["rating"] == 5

    drv_rate = client.post(
        f"/api/v1/rides/{ride_id}/rating",
        headers=driver,
        json={"rating": 4, "comment": "Pasajero puntual"},
    )
    assert drv_rate.status_code == 200, drv_rate.text
    assert drv_rate.json()["driver_rating"]["rating"] == 4

    assert client.get("/api/v1/drivers/me/active", headers=driver).json() is None
    assert client.get("/api/v1/passengers/me/active", headers=passenger).json() is None


def test_authenticated_user_can_request_nav_route(client):
    register(client, "driver", "9993000006", "ruta-nav@ruta.local", vehicle=True)
    headers = login(client, "ruta-nav@ruta.local")
    response = client.post(
        "/api/v1/geo/route",
        headers=headers,
        json={
            "origin": {"latitude": 20.9674, "longitude": -89.5926},
            "destination": {"latitude": 20.99, "longitude": -89.63},
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["distance_m"] > 0
    assert body["duration_s"] > 0
    assert len(body["route"]["coordinates"]) >= 2
    assert isinstance(body["steps"], list)
    assert len(body["steps"]) >= 1
    assert "instruction" in body["steps"][0]
