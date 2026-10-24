from tests.conftest import login, make_admin, ready_driver, register

AIRPORT = {"latitude": 20.9370, "longitude": -89.6577}
CENTRO = {"latitude": 20.9674, "longitude": -89.5926}


def trip(origin, destination):
    return {"origin": origin, "destination": destination, "origin_label": "A", "destination_label": "B"}


def test_cannot_request_pickup_at_airport_but_can_go_there(client):
    admin = make_admin(client)
    ready_driver(client, "9998000001", "zona@ruta.local", CENTRO["latitude"], CENTRO["longitude"], admin)
    register(client, "passenger", "9998000002", "vuelo@ruta.local")
    passenger = login(client, "vuelo@ruta.local")

    estimate = client.post("/api/v1/ride-requests/estimate", headers=passenger, json=trip(AIRPORT, CENTRO))
    assert estimate.status_code == 400
    assert "aeropuerto" in estimate.json()["detail"].lower()
    assert client.post("/api/v1/ride-requests", headers=passenger, json=trip(AIRPORT, CENTRO)).status_code == 400

    assert client.post("/api/v1/ride-requests", headers=passenger, json=trip(CENTRO, AIRPORT)).status_code == 200
