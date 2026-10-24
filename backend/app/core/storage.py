"""Archivos subidos: Supabase Storage si está configurado, disco local en desarrollo."""

import shutil
from pathlib import Path
from typing import BinaryIO

import httpx
from app.config.settings import settings

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _remote() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_key.get_secret_value())


def _object_url(key: str) -> str:
    return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_bucket}/{key}"


def _headers() -> dict[str, str]:
    secret = settings.supabase_service_key.get_secret_value()
    return {"Authorization": f"Bearer {secret}", "apikey": secret}


def save(key: str, content: bytes | BinaryIO, content_type: str = "application/octet-stream") -> None:
    """Guarda un archivo bajo la clave indicada.

    Args:
        key: Ruta relativa, por ejemplo ``documents/<uuid>.pdf``.
        content: Bytes o archivo abierto en modo binario.
        content_type: Tipo MIME que se registra en Supabase.
    """
    if _remote():
        response = httpx.post(
            _object_url(key),
            headers={**_headers(), "Content-Type": content_type},
            content=content,
            timeout=120,
        )
        response.raise_for_status()
        return
    target = DATA_DIR / key
    target.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        target.write_bytes(content)
        return
    with target.open("wb") as out:
        shutil.copyfileobj(content, out)


def load(key: str) -> bytes | None:
    """Devuelve el contenido del archivo o ``None`` si no existe.

    Args:
        key: Ruta relativa con la que se guardó.

    Returns:
        Los bytes del archivo, o ``None`` si no se encuentra.
    """
    if _remote():
        response = httpx.get(_object_url(key), headers=_headers(), timeout=120)
        if response.status_code in (400, 404):
            return None
        response.raise_for_status()
        return response.content
    path = DATA_DIR / key
    return path.read_bytes() if path.is_file() else None
