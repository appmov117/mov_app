import time
from collections import defaultdict

from app.core.errors import AppError
from starlette.requests import Request

_hits: dict[str, list[float]] = defaultdict(list)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "local"


def hit(key: str, limit: int, window_seconds: float) -> None:
    now = time.monotonic()
    bucket = [stamp for stamp in _hits[key] if now - stamp < window_seconds]
    if len(bucket) >= limit:
        _hits[key] = bucket
        raise AppError(429, "Demasiadas solicitudes. Espera un momento.")
    bucket.append(now)
    _hits[key] = bucket


def reset() -> None:
    _hits.clear()
