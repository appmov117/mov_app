"""Foto de perfil: se guarda con un nombre único y se sirve con caché permanente."""

import re
from uuid import uuid4

from app.core import storage
from app.core.errors import AppError
from app.users.models import User
from sqlalchemy.orm import Session

MAX_BYTES = 2_000_000
TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
NAME = re.compile(r"^[0-9a-f-]{36}\.(jpg|png|webp)$")


def avatar_url(user: User) -> str | None:
    """Ruta pública de la foto del usuario, o None si no ha subido una."""
    if not user.avatar_key:
        return None
    return f"/api/v1/avatars/{user.avatar_key.removeprefix('avatars/')}"


def save_avatar(db: Session, user: User, content_type: str | None, content: bytes) -> str:
    """Guarda la foto nueva del usuario.

    Args:
        db: Sesión de base de datos.
        user: Usuario con sesión.
        content_type: Tipo MIME declarado por el navegador.
        content: Bytes de la imagen.

    Returns:
        La ruta pública de la foto.
    """
    ext = TYPES.get((content_type or "").split(";")[0].strip().lower())
    if ext is None:
        raise AppError(400, "Sube una imagen JPG, PNG o WebP")
    if not content or len(content) > MAX_BYTES:
        raise AppError(400, "La foto debe pesar menos de 2 MB")
    key = f"avatars/{uuid4()}{ext}"
    storage.save(key, content, content_type or "application/octet-stream")
    user.avatar_key = key
    db.commit()
    return avatar_url(user)


def load_avatar(name: str) -> tuple[bytes, str]:
    """Devuelve la foto y su tipo MIME a partir del nombre público."""
    content = storage.load(f"avatars/{name}") if NAME.match(name) else None
    if content is None:
        raise AppError(404, "No encontramos la foto")
    mime = next(mime for mime, ext in TYPES.items() if name.endswith(ext))
    return content, mime
