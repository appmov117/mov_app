from tests.conftest import login, make_admin, ready_driver, register


def start_ride(client) -> tuple[dict, dict, str]:
    admin = make_admin(client)
    driver = ready_driver(client, "9997000010", "chat-driver@ruta.local", 20.9674, -89.5926, admin)
    register(client, "passenger", "9997000011", "chat-pax@ruta.local")
    passenger = login(client, "chat-pax@ruta.local")
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
    return driver, passenger, ride_id


def test_passenger_and_driver_exchange_messages(client):
    driver, passenger, ride_id = start_ride(client)
    url = f"/api/v1/rides/{ride_id}/messages"

    sent = client.post(url, headers=passenger, json={"body": "  Llego enseguida  "})
    assert sent.status_code == 200, sent.text
    assert sent.json()["body"] == "Llego enseguida"
    assert sent.json()["sender_role"] == "passenger"
    client.post(url, headers=driver, json={"body": "Ya llegué"})

    thread = client.get(url, headers=driver).json()
    assert [row["body"] for row in thread] == ["Llego enseguida", "Ya llegué"]
    assert thread[0]["read_at"] is None

    client.post(f"{url}/read", headers=driver)
    thread = client.get(url, headers=passenger).json()
    assert thread[0]["read_at"] is not None
    assert thread[1]["read_at"] is None

    notes = client.get("/api/v1/notifications", headers=driver).json()
    assert any(note["body"] == "Llego enseguida" for note in notes)


def test_outsiders_and_empty_messages_are_rejected(client):
    _driver, passenger, ride_id = start_ride(client)
    url = f"/api/v1/rides/{ride_id}/messages"
    register(client, "passenger", "9997000012", "chat-otro@ruta.local")
    other = login(client, "chat-otro@ruta.local")

    assert client.post(url, headers=other, json={"body": "Hola"}).status_code == 403
    assert client.get(url, headers=other).status_code == 403
    assert client.post(url, headers=passenger, json={"body": "   "}).status_code == 400
    assert client.post(url, headers=passenger, json={"body": "x" * 501}).status_code == 422


def test_messages_close_when_ride_ends(client):
    driver, passenger, ride_id = start_ride(client)
    client.post(f"/api/v1/rides/{ride_id}/cancel", headers=passenger)

    closed = client.post(
        f"/api/v1/rides/{ride_id}/messages", headers=driver, json={"body": "¿Sigues ahí?"}
    )
    assert closed.status_code == 409
