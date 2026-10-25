"""Archivos subidos: Supabase Storage si está configurado, disco local en desarrollo."""

import logging
import shutil
from pathlib import Path
from typing import BinaryIO

import httpx
from app.config.settings import settings
from app.core.errors import AppError

logger = logging.getLogger("ruta.storage")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _remote() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_key.get_secret_value())


def backend() -> str:
    """Dónde se guardan los archivos: ``supabase`` o ``local`` (se pierde al reiniciar en la nube)."""
    return "supabase" if _remote() else "local"


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
        try:
            response = httpx.post(
                _object_url(key),
                headers={**_headers(), "Content-Type": content_type},
                content=content,
                timeout=120,
            )
        except httpx.HTTPError as error:
            logger.error("storage_upload_unreachable key=%s error=%s", key, error)
            raise AppError(503, "No pudimos guardar el archivo. Inténtalo de nuevo en un momento.") from error
        if response.is_error:
            # El cuerpo de Supabase dice la causa (llave inválida, bucket inexistente, permisos).
            logger.error("storage_upload_failed key=%s status=%s body=%s", key, response.status_code, response.text[:300])
            raise AppError(502, "No pudimos guardar el archivo. Inténtalo de nuevo en un momento.")
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
