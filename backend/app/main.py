import asyncio
import logging
import mimetypes
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.complaints.router import router as complaints_router
from app.config.settings import settings
from app.core import storage
from app.core.app_settings import payment_url
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.core.ws import hub, relay, set_loop
from app.db.session import SessionLocal, get_db
from app.drivers.router import router as drivers_router
from app.locations.router import router as locations_router
from app.memberships.router import router as memberships_router
from app.messages.router import router as messages_router
from app.notifications.router import router as notifications_router
from app.passengers.router import router as passengers_router
from app.providers.geocoding import geocoding_provider
from app.providers.routing import routing_provider
from app.ratings.router import router as ratings_router
from app.realtime import events as live_events
from app.realtime.router import router as live_router
from app.referrals.router import router as referrals_router
from app.rides.pricing import tariffs
from app.rides.router import router as rides_router
from app.rides.schemas import PointIn
from app.rides.service import tick
from app.safety.router import router as safety_router
from app.seed import seed_if_empty
from app.users.models import User
from app.users.router import router as users_router
from app.vehicles.router import router as vehicles_router

logger = logging.getLogger("ruta")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("request_id=%s route=%s error=unhandled", request_id, request.url.path)
            raise
        latency = int((time.perf_counter() - started) * 1000)
        user_id = getattr(request.state, "user_id", None)
        logger.info(
            "request_id=%s user_id=%s route=%s status_code=%s latency_ms=%s",
            request_id,
            user_id,
            f"{request.method} {request.url.path}",
            response.status_code,
            latency,
        )
        response.headers["x-request-id"] = request_id
        return response


def migrate() -> None:
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")


async def matcher_loop() -> None:
    while True:
        await asyncio.sleep(2)

        def _run() -> None:
            db = SessionLocal()
            try:
                tick(db)
            except Exception:
                db.rollback()
                logger.exception("tick")
            finally:
                db.close()

        await asyncio.to_thread(_run)


@asynccontextmanager
async def lifespan(app: FastAPI):
    set_loop(asyncio.get_running_loop())
    live_events.register()
    relay_task = asyncio.create_task(relay())
    if not settings.testing:
        migrate()
        if settings.seed:
            db = SessionLocal()
            try:
                seed_if_empty(db)
            finally:
                db.close()
        task = asyncio.create_task(matcher_loop())
        yield
        task.cancel()
        relay_task.cancel()
        return
    yield
    relay_task.cancel()


app = FastAPI(title="Ruta", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestLogMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error(_request: Request, exc: AppError):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/api/v1/health")
def health():
    return {"ok": True}


@app.get("/api/v1/meta")
def meta(db: Session = Depends(get_db)):
    return {
        "zone_name": settings.zone_name,
        "zone": {"latitude": settings.zone_lat, "longitude": settings.zone_lng},
        "membership_price": float(settings.membership_price),
        "membership_days": settings.membership_days,
        "tariffs": {
            kind: {name: float(amount) for name, amount in values.items()} for kind, values in tariffs(db).items()
        },
        "payment_url": payment_url(db),
    }


@app.get("/api/v1/geo/search")
async def geo_search(q: str):
    try:
        places = await geocoding_provider.search(q)
    except Exception:
        return []
    return [{"label": place.label, "latitude": place.latitude, "longitude": place.longitude} for place in places]


class RouteIn(BaseModel):
    origin: PointIn
    destination: PointIn


@app.post("/api/v1/geo/route")
async def geo_route(data: RouteIn, user: User = Depends(get_current_user)):
    del user
    result = await routing_provider.route(
        (data.origin.latitude, data.origin.longitude),
        (data.destination.latitude, data.destination.longitude),
    )
    return {
        "distance_m": result.distance_m,
        "duration_s": result.duration_s,
        "route": {"type": "LineString", "coordinates": result.geometry},
        "steps": [
            {
                "instruction": step.instruction,
                "modifier": step.modifier,
                "type": step.type,
                "name": step.name,
                "distance_m": step.distance_m,
                "duration_s": step.duration_s,
                "location": {"longitude": step.location[0], "latitude": step.location[1]},
            }
            for step in result.steps
        ],
    }


def _owns_file(db: Session, user: User, file_url: str) -> bool:
    from sqlalchemy import or_, select

    from app.drivers.models import Driver, DriverDocument
    from app.memberships.models import MembershipPayment

    driver_id = db.scalar(select(Driver.id).where(Driver.user_id == user.id))
    if driver_id is None:
        return False
    documents = select(DriverDocument.id).where(DriverDocument.driver_id == driver_id, DriverDocument.file_url == file_url)
    receipts = select(MembershipPayment.id).where(
        MembershipPayment.driver_id == driver_id, MembershipPayment.receipt_url == file_url
    )
    return db.scalar(select(or_(documents.exists(), receipts.exists()))) is True


@app.get("/api/v1/files/{folder}/{name}")
def download_file(
    folder: str, name: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Entrega un comprobante o documento solo al administrador o al conductor que lo subió."""
    if folder not in {"receipts", "documents"} or "/" in name or ".." in name:
        raise HTTPException(status_code=404)
    if user.role != "admin" and not _owns_file(db, user, f"{folder}/{name}"):
        raise HTTPException(status_code=404)
    content = storage.load(f"{folder}/{name}")
    if content is None:
        raise HTTPException(status_code=404)
    media_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return Response(content, media_type=media_type)


@app.websocket("/ws/rides/{ride_id}")
async def ride_socket(websocket: WebSocket, ride_id: uuid.UUID):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        await websocket.close(code=4401)
        return
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        from sqlalchemy import select

        from app.drivers.models import Driver
        from app.passengers.models import Passenger
        from app.rides.models import Ride

        ride = db.get(Ride, ride_id)
        if user is None or ride is None:
            await websocket.close(code=4403)
            return
        allowed = user.role == "admin"
        if not allowed and user.role == "driver":
            driver = db.scalar(select(Driver).where(Driver.user_id == user.id))
            allowed = driver is not None and driver.id == ride.driver_id
        if not allowed and user.role == "passenger":
            passenger = db.scalar(select(Passenger).where(Passenger.user_id == user.id))
            allowed = passenger is not None and passenger.id == ride.passenger_id
        if not allowed:
            await websocket.close(code=4403)
            return
    finally:
        db.close()
    await hub.connect(str(ride_id), websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.drop(str(ride_id), websocket)


for item in (
    auth_router,
    passengers_router,
    drivers_router,
    vehicles_router,
    locations_router,
    rides_router,
    ratings_router,
    complaints_router,
    safety_router,
    messages_router,
    memberships_router,
    referrals_router,
    notifications_router,
    admin_router,
    users_router,
):
    app.include_router(item, prefix="/api/v1")

app.include_router(live_router)


if settings.frontend_dist:
    dist = Path(settings.frontend_dist).resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        """Sirve la PWA compilada y responde index.html en las rutas del cliente."""
        if path.startswith(("api/", "ws/")):
            raise HTTPException(status_code=404)
        target = (dist / path).resolve()
        if path and target.is_file() and target.is_relative_to(dist):
            return FileResponse(target)
        return FileResponse(dist / "index.html")
