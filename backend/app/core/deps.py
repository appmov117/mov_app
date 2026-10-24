from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.users.models import User
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AppError(401, "Inicia sesión para continuar")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = UUID(payload["sub"])
    except (ValueError, KeyError):
        raise AppError(401, "La sesión no es válida") from None
    user = db.get(User, user_id)
    if user is None or user.status == "blocked":
        raise AppError(401, "La sesión no es válida")
    if user.status == "suspended":
        raise AppError(403, "Tu cuenta está suspendida")
    return user


def require_role(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError(403, "No tienes permiso para esta acción")
        return user

    return dependency


def month_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def period_start(period: str) -> datetime:
    now = datetime.now(UTC)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
