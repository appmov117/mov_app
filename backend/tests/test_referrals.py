from tests.conftest import login, make_admin, ready_driver
from tests.test_flow import trip


def test_referral_summary_counts_this_month_progress(client):
    admin = make_admin(client)
    driver = ready_driver(client, "9998000001", "invita@ruta.local", 20.9674, -89.5926, admin)
    summary = client.get("/api/v1/drivers/me/referral", headers=driver).json()
    assert summary["month_passengers"] == 0
    assert summary["monthly_cap_days"] == 45

    registered = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Invitada",
            "phone": "9998000002",
            "email": "invitada@ruta.local",
            "password": "clave1234",
            "role": "passenger",
            "referral_code": summary["code"],
        },
    )
    assert registered.status_code == 200, registered.text
    passenger = login(client, "invitada@ruta.local")
    assert client.post("/api/v1/ride-requests", headers=passenger, json=trip()).status_code == 200
    offer = client.get("/api/v1/drivers/me/ride-offers", headers=driver).json()[0]
    ride_id = client.post(f"/api/v1/ride-offers/{offer['id']}/accept", headers=driver).json()["id"]
    for step in ("arriving", "arrived", "start"):
        assert client.post(f"/api/v1/rides/{ride_id}/{step}", headers=driver).status_code == 200
    done = client.post(f"/api/v1/rides/{ride_id}/complete", headers=driver, json={"fare_amount": 50, "payment_method": "cash"})
    assert done.status_code == 200, done.text

    summary = client.get("/api/v1/drivers/me/referral", headers=driver).json()
    assert summary["month_passengers"] == 1
    assert summary["active_passengers"] == 1
