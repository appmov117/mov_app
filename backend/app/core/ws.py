import asyncio
import json
import logging
from typing import Any

from app.config.settings import settings
from fastapi import WebSocket

logger = logging.getLogger("ruta")
CHANNEL = "ruta:live"


class Hub:
    """Sockets abiertos en este proceso, agrupados por sala (viaje, conductor o pasajero)."""

    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, room: str, socket: WebSocket) -> None:
        await socket.accept()
        self.join(room, socket)

    def join(self, room: str, socket: WebSocket) -> None:
        self.rooms.setdefault(room, set()).add(socket)

    def drop(self, room: str, socket: WebSocket) -> None:
        sockets = self.rooms.get(room)
        if not sockets:
            return
        sockets.discard(socket)
        if not sockets:
            self.rooms.pop(room, None)

    async def broadcast(self, room: str, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for socket in list(self.rooms.get(room, set())):
            try:
                await socket.send_json(message)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self.drop(room, socket)


hub = Hub()
_loop: asyncio.AbstractEventLoop | None = None
_redis = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def driver_room(driver_id: Any) -> str:
    return f"driver:{driver_id}"


def passenger_room(passenger_id: Any) -> str:
    return f"passenger:{passenger_id}"


async def _send(room: str, message: dict[str, Any]) -> None:
    if _redis is None:
        await hub.broadcast(room, message)
        return
    await _redis.publish(CHANNEL, json.dumps({"room": room, "message": message}))


def emit(room: str, message: dict[str, Any]) -> None:
    """Entrega un mensaje a una sala; con Redis llega a todas las réplicas del API."""
    if _loop is None or not _loop.is_running():
        return
    asyncio.run_coroutine_threadsafe(_send(room, message), _loop)


def publish(ride_id: str, message: dict[str, Any], *rooms: str) -> None:
    """Publica en la sala del viaje y, si se indican, en las salas de sus participantes."""
    emit(ride_id, message)
    for room in rooms:
        emit(room, {**message, "ride_id": ride_id})


async def relay() -> None:
    """Escucha Redis y reparte cada mensaje entre los sockets de este proceso.

    Sin `REDIS_URL` no hace nada: el hub en memoria basta para un solo proceso.
    """
    global _redis
    if not settings.redis_url:
        return
    from redis.asyncio import Redis

    _redis = Redis.from_url(settings.redis_url)
    pubsub = _redis.pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        async for item in pubsub.listen():
            if item.get("type") != "message":
                continue
            try:
                payload = json.loads(item["data"])
                await hub.broadcast(payload["room"], payload["message"])
            except (ValueError, KeyError):
                logger.warning("mensaje en vivo inválido")
    finally:
        await pubsub.aclose()
        await _redis.aclose()
        _redis = None
