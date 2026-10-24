import asyncio
import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import select

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.core.ws import driver_room, hub, passenger_room
from app.db.session import SessionLocal
from app.drivers.models import Driver
from app.locations.router import LocationIn
from app.locations.service import update_location
from app.passengers.models import Passenger
from app.users.models import User

router = APIRouter()


def _authenticate(token: str | None) -> tuple[uuid.UUID, str] | None:
    """Devuelve el usuario y su sala, o None si el token no sirve."""
    if not token:
        return None
    try:
        user_id = uuid.UUID(decode_access_token(token)["sub"])
    except (ValueError, KeyError):
        return None
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is None or user.status in {"blocked", "suspended"}:
            return None
        if user.role == "driver":
            driver_id = db.scalar(select(Driver.id).where(Driver.user_id == user.id))
            return (user.id, driver_room(driver_id)) if driver_id else None
        if user.role == "passenger":
            passenger_id = db.scalar(select(Passenger.id).where(Passenger.user_id == user.id))
            return (user.id, passenger_room(passenger_id)) if passenger_id else None
        return None
    finally:
        db.close()


def _save_location(user_id: uuid.UUID, data: LocationIn) -> None:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is not None:
            update_location(db, user, data.latitude, data.longitude, data.heading, data.speed)
    except AppError:
        db.rollback()
    finally:
        db.close()


@router.websocket("/ws/me")
async def live_socket(websocket: WebSocket) -> None:
    """Canal por usuario: el servidor avisa cambios y el conductor envía su ubicación."""
    session = await asyncio.to_thread(_authenticate, websocket.query_params.get("token"))
    if session is None:
        await websocket.close(code=4401)
        return
    user_id, room = session
    await hub.connect(room, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except ValueError:
                continue
            kind = message.get("type") if isinstance(message, dict) else None
            if kind == "location" and room.startswith("driver:"):
                try:
                    data = LocationIn.model_validate(message.get("data"))
                except ValidationError:
                    continue
                await asyncio.to_thread(_save_location, user_id, data)
            elif kind == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.drop(room, websocket)
