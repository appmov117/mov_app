import pytest
from app.core import storage
from tests.conftest import login, register

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 200


@pytest.fixture(autouse=True)
def local_files(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)


def user(client) -> dict:
    register(client, "passenger", "9996000001", "foto@ruta.local")
    return login(client, "foto@ruta.local")


def upload(client, headers, content=JPEG, mime="image/jpeg", name="yo.jpg"):
    return client.post("/api/v1/users/me/avatar", headers=headers, files={"file": (name, content, mime)})


def test_uploaded_photo_appears_in_profile_and_is_served_with_long_cache(client):
    headers = user(client)
    assert client.get("/api/v1/auth/me", headers=headers).json()["avatar_url"] is None

    response = upload(client, headers)
    assert response.status_code == 200, response.text
    url = client.get("/api/v1/auth/me", headers=headers).json()["avatar_url"]
    assert url == response.json()["avatar_url"]

    image = client.get(url)
    assert image.status_code == 200
    assert image.content == JPEG
    assert image.headers["content-type"] == "image/jpeg"
    assert "immutable" in image.headers["cache-control"]


def test_rejects_files_that_are_not_images_or_too_big(client):
    headers = user(client)
    assert upload(client, headers, b"hola", "text/plain", "nota.txt").status_code == 400
    assert upload(client, headers, b"\xff\xd8\xff" + b"0" * 2_100_000).status_code == 400


def test_unknown_or_malformed_avatar_names_return_404(client):
    assert client.get("/api/v1/avatars/no-existe.jpg").status_code == 404
    assert client.get("/api/v1/avatars/..%2Fsecret.jpg").status_code == 404


def test_storage_failure_returns_clear_error_and_keeps_old_photo(client, monkeypatch):
    import httpx
    from app.core import storage

    register(client, "passenger", "9994000099", "falla-foto@ruta.local")
    headers = login(client, "falla-foto@ruta.local")
    monkeypatch.setattr(storage, "_remote", lambda: True)
    monkeypatch.setattr(storage, "_headers", lambda: {})
    monkeypatch.setattr(
        storage.httpx, "post", lambda *args, **kwargs: httpx.Response(403, text='{"message":"invalid key"}')
    )
    response = client.post(
        "/api/v1/users/me/avatar", headers=headers, files={"file": ("foto.jpg", b"\xff\xd8\xff" + b"0" * 50, "image/jpeg")}
    )
    assert response.status_code == 502
    assert "No pudimos guardar" in response.json()["detail"]
    assert client.get("/api/v1/auth/me", headers=headers).json()["avatar_url"] is None
