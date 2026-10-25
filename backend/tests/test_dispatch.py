from app.rides.ranking import Candidate, order_candidates
from tests.conftest import make_admin, ready_driver
from tests.test_counter_offers import request_ride


def test_next_wave_opens_as_soon_as_everyone_rejects(client):
    admin = make_admin(client)
    near = ready_driver(client, "9997000001", "cerca@ruta.local", 20.9674, -89.5926, admin)
    # A unos 3 km: fuera de la primera ronda (2 km), dentro de la segunda (4 km).
    far = ready_driver(client, "9997000002", "lejos@ruta.local", 20.9940, -89.5926, admin)
    request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=near).json()[0]
    assert client.get("/api/v1/drivers/me/ride-offers", headers=far).json() == []

    assert client.post(f"/api/v1/ride-offers/{offer['id']}/reject", headers=near, json={}).status_code == 200
    # Sin esperar al ciclo del servidor: la oferta ya llegó al conductor de la segunda ronda.
    assert len(client.get("/api/v1/drivers/me/ride-offers", headers=far).json()) == 1


def test_declined_counter_moves_search_forward(client):
    admin = make_admin(client)
    near = ready_driver(client, "9997000011", "contra1@ruta.local", 20.9674, -89.5926, admin)
    far = ready_driver(client, "9997000012", "contra2@ruta.local", 20.9940, -89.5926, admin)
    passenger, _request = request_ride(client)
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=near).json()[0]
    amount = offer["min_counter_fare"] + 5
    assert client.post(f"/api/v1/ride-offers/{offer['id']}/counter", headers=near, json={"amount": amount}).status_code == 200

    declined = client.post(f"/api/v1/ride-offers/{offer['id']}/counter/decline", headers=passenger)
    assert declined.status_code == 200
    assert len(client.get("/api/v1/drivers/me/ride-offers", headers=far).json()) == 1


def _candidates() -> list[Candidate]:
    # Ordenados por línea recta, como los entrega PostGIS.
    return [
        Candidate(id="a", latitude=0, longitude=0, meters=500, favorite=False),
        Candidate(id="b", latitude=0, longitude=0, meters=800, favorite=False),
        Candidate(id="c", latitude=0, longitude=0, meters=1200, favorite=False),
    ]


def test_candidates_are_ordered_by_road_eta():
    # "a" está más cerca en línea recta pero tarda más por calles (p. ej., del otro lado de una avenida).
    assert order_candidates(_candidates(), [400, 120, 300], 2) == ["b", "c"]


def test_favorite_goes_first_and_missing_eta_keeps_distance_order():
    rows = _candidates()
    rows[2] = Candidate(id="c", latitude=0, longitude=0, meters=1200, favorite=True)
    assert order_candidates(rows, [400, 120, 300], 2) == ["c", "b"]
    assert order_candidates(_candidates(), None, 2) == ["a", "b"]
    # Un conductor sin ruta posible (None) queda al final.
    assert order_candidates(_candidates(), [None, 200, 100], 3) == ["c", "b", "a"]


def test_driver_sees_demand_zones_with_unserved_first(client):
    from app.db.session import SessionLocal
    from sqlalchemy import text

    admin = make_admin(client)
    driver = ready_driver(client, "9997000021", "zonas@ruta.local", 20.9674, -89.5926, admin)
    passenger, _request = request_ride(client)
    active = client.get("/api/v1/passengers/me/active", headers=passenger).json()["request"]
    client.post(f"/api/v1/ride-requests/{active['id']}/cancel", headers=passenger)
    # Una solicitud vieja que venció sin conductor en García Ginerés.
    db = SessionLocal()
    db.execute(
        text(
            """
            INSERT INTO ride_requests (id, passenger_id, origin, destination, status, created_at)
            SELECT gen_random_uuid(), passenger_id,
                   ST_SetSRID(ST_MakePoint(-89.6245, 20.9938), 4326)::geography, destination, 'expired', NOW()
            FROM ride_requests LIMIT 1
            """
        )
    )
    db.commit()
    db.close()

    demand = client.get("/api/v1/drivers/me/demand?hours=2", headers=driver).json()
    assert demand["total"] == 2
    assert demand["zones"][0]["unserved"] == 1
    assert 3000 < demand["zones"][0]["distance_m"] < 5000
    assert demand["zones"][1]["unserved"] == 0
    assert client.get("/api/v1/drivers/me/demand?hours=24", headers=driver).status_code == 400
    assert client.get("/api/v1/drivers/me/demand", headers=passenger).status_code == 403


def test_offer_keeps_road_eta_and_counters_reuse_it(client, monkeypatch):
    from app.rides import service
    from app.rides.ranking import Leg

    calls = []

    def fake_legs(origin, pool):
        calls.append(len(pool))
        return [Leg(seconds=420, meters=2600) for _ in pool]

    monkeypatch.setattr(service, "pickup_legs", fake_legs)
    admin = make_admin(client)
    driver = ready_driver(client, "9997000031", "eta@ruta.local", 20.9674, -89.5926, admin)
    passenger, _request = request_ride(client)

    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    assert (offer["pickup_distance_m"], offer["pickup_eta_s"], offer["pickup_by_road"]) == (2600, 420, True)
    client.post(f"/api/v1/ride-offers/{offer['id']}/counter", headers=driver, json={"amount": offer["min_counter_fare"] + 5})
    counter = client.get("/api/v1/passengers/me/active", headers=passenger).json()["request"]["counter_offers"][0]
    assert (counter["pickup_eta_s"], counter["pickup_by_road"]) == (420, True)
    # Una sola consulta al abrir la ronda; mostrar la oferta y la contraoferta no consulta de nuevo.
    assert calls == [1]


def test_demand_zone_distances_come_from_cache(client, monkeypatch):
    from app.drivers import demand
    from app.rides.ranking import Leg

    calls = []

    def fake_road_legs(sources, destinations):
        calls.append(len(destinations))
        return [[Leg(seconds=300, meters=3100) for _ in destinations]]

    monkeypatch.setattr(demand, "road_legs", fake_road_legs)
    demand._road_cache.clear()
    admin = make_admin(client)
    driver = ready_driver(client, "9997000041", "cache@ruta.local", 20.9674, -89.5926, admin)
    request_ride(client)

    first = client.get("/api/v1/drivers/me/demand?hours=2", headers=driver).json()
    second = client.get("/api/v1/drivers/me/demand?hours=2", headers=driver).json()
    assert first["zones"][0]["distance_m"] == 3100
    assert first["zones"][0]["distance_by_road"] is True
    assert second["zones"] == first["zones"]
    assert calls == [1]


def test_single_pair_matrix_is_padded_to_two_elements(monkeypatch):
    from app.rides import ranking

    sent = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            # Mapbox responde una fila por origen: el conductor y el destino agregado de relleno.
            return {"durations": [[108.2], [0]], "distances": [[373.9], [0]]}

    def fake_get(url, params, timeout):
        sent.update(params)
        return Response()

    monkeypatch.setattr(ranking.settings, "testing", False)
    monkeypatch.setattr(ranking.settings, "mapbox_access_token", "pk.prueba")
    monkeypatch.setattr(ranking.httpx, "get", fake_get)

    rows = ranking.road_legs([{"latitude": 20.969, "longitude": -89.5945}], [{"latitude": 20.9674, "longitude": -89.5926}])
    assert sent["sources"] == "0;1" and sent["destinations"] == "2"
    assert rows == [[ranking.Leg(seconds=108.2, meters=373.9)]]
