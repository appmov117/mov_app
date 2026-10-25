import json
from datetime import timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from app.config.settings import settings
from app.core.errors import AppError
from app.core.support import audit, money, track, utcnow
from app.core.ws import publish
from app.drivers.models import Driver
from app.drivers.onboarding import can_operate, review_documents
from app.notifications.service import notify
from app.passengers.models import FavoriteDriver, Passenger
from app.ratings.models import Rating
from app.referrals.service import on_passenger_ride_completed
from app.rides import pricing, repository
from app.rides.chaining import URBAN_MPS, finishing_candidates
from app.rides.models import Ride, RideEvent, RideOffer, RideRequest
from app.rides.ranking import MAX_CANDIDATES, Leg, order_candidates, pickup_legs
from app.rides.zones import ensure_pickup_allowed
from app.users.models import User
from app.vehicles.models import Vehicle
from sqlalchemy import func, select
from sqlalchemy.orm import Session

WAVES = (
    {"count": 3, "radius": 2000, "wait": 20},
    {"count": 5, "radius": 4000, "wait": 20},
    {"count": 8, "radius": 8000, "wait": 20},
)
ACTIVE_RIDE = ("accepted", "driver_arriving", "driver_arrived", "in_progress")
OPEN_REQUEST = ("searching", "offered")
OPEN_OFFER = ("pending", "countered")
TRANSITIONS = {
    "accepted": {"driver_arriving", "cancelled"},
    "driver_arriving": {"driver_arrived", "cancelled"},
    "driver_arrived": {"in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
}


def driver_for_user(db: Session, user: User) -> Driver:
    driver = db.scalar(select(Driver).where(Driver.user_id == user.id))
    if driver is None:
        raise AppError(404, "No encontramos tu perfil de conductor")
    return driver


def passenger_for_user(db: Session, user: User) -> Passenger:
    passenger = db.scalar(select(Passenger).where(Passenger.user_id == user.id))
    if passenger is None:
        raise AppError(404, "No encontramos tu perfil de pasajero")
    return passenger


def _active_ride_for_passenger(db: Session, passenger_id: UUID) -> Ride | None:
    return db.scalar(
        select(Ride).where(Ride.passenger_id == passenger_id, Ride.status.in_(ACTIVE_RIDE))
    )


def _active_ride_for_driver(db: Session, driver_id: UUID) -> Ride | None:
    """El viaje en curso; si hay uno en espera, se devuelve primero el más antiguo."""
    return db.scalar(
        select(Ride)
        .where(Ride.driver_id == driver_id, Ride.status.in_(ACTIVE_RIDE))
        .order_by(Ride.created_at)
        .limit(1)
    )


def _can_queue(db: Session, driver_id: UUID) -> bool:
    """True si el conductor lleva pasajero a bordo y aún no tiene un viaje en espera."""
    statuses = db.scalars(select(Ride.status).where(Ride.driver_id == driver_id, Ride.status.in_(ACTIVE_RIDE))).all()
    return list(statuses) == ["in_progress"]


def _open_request(db: Session, passenger_id: UUID) -> RideRequest | None:
    return db.scalar(
        select(RideRequest).where(
            RideRequest.passenger_id == passenger_id, RideRequest.status.in_(OPEN_REQUEST)
        )
    )


def _event(db: Session, ride_id: UUID, event_type: str, metadata: dict | None = None) -> None:
    db.add(RideEvent(ride_id=ride_id, event_type=event_type, metadata_json=metadata))


def _release_driver(db: Session, driver: Driver) -> None:
    from app.memberships.service import active_membership

    if active_membership(db, driver.id) and can_operate(driver):
        driver.driver_status = "online"
    else:
        driver.driver_status = "offline"


def _vehicle(db: Session, driver_id: UUID) -> dict | None:
    vehicle = db.scalar(
        select(Vehicle).where(Vehicle.driver_id == driver_id, Vehicle.active.is_(True)).order_by(Vehicle.created_at)
    )
    if vehicle is None:
        return None
    return {
        "id": str(vehicle.id),
        "brand": vehicle.brand,
        "model": vehicle.model,
        "year": vehicle.year,
        "color": vehicle.color,
        "plate": vehicle.plate,
        "kind": vehicle.kind,
    }


def present_ride(db: Session, ride: Ride) -> dict:
    request = db.get(RideRequest, ride.ride_request_id)
    driver = db.get(Driver, ride.driver_id)
    driver_user = db.get(User, driver.user_id) if driver else None
    passenger = db.get(Passenger, ride.passenger_id)
    passenger_user = db.get(User, passenger.user_id) if passenger else None
    coords = repository.ride_coords(db, ride.id)
    ratings = db.scalars(select(Rating).where(Rating.ride_id == ride.id)).all()
    by_passenger = next((row for row in ratings if row.author_role == "passenger"), None)
    by_driver = next((row for row in ratings if row.author_role == "driver"), None)

    def _rating(row: Rating | None) -> dict | None:
        if row is None:
            return None
        return {"rating": row.rating, "comment": row.comment}

    return {
        "id": str(ride.id),
        "request_id": str(ride.ride_request_id),
        "status": ride.status,
        "origin": coords["origin"],
        "destination": coords["destination"],
        "origin_label": request.origin_label if request else None,
        "destination_label": request.destination_label if request else None,
        "stops": request.stops if request else [],
        "current_stop_index": ride.current_stop_index,
        "stop_arrived": ride.stop_arrived,
        "next_stop": (
            request.stops[ride.current_stop_index]
            if request and ride.current_stop_index < len(request.stops)
            else None
        ),
        "route": request.route_geometry if request else None,
        "estimated_fare": money(request.estimated_fare) if request else None,
        "estimated_distance_m": request.estimated_distance_m if request else None,
        "estimated_duration_s": request.estimated_duration_s if request else None,
        "fare_amount": money(ride.fare_amount),
        "payment_method": ride.payment_method,
        "distance_m": ride.distance_m,
        "duration_s": ride.duration_s,
        "started_at": ride.started_at.isoformat() if ride.started_at else None,
        "completed_at": ride.completed_at.isoformat() if ride.completed_at else None,
        "created_at": ride.created_at.isoformat() if ride.created_at else None,
        "passenger": {"name": passenger_user.name} if passenger_user else None,
        "driver": {
            "id": str(driver.id),
            "name": driver_user.name if driver_user else "",
            "phone": driver_user.phone if driver_user else None,
            "rating": float(driver.rating),
            "vehicle": _vehicle(db, driver.id),
            "location": repository.driver_coords(db, driver.id),
        }
        if driver and driver_user
        else None,
        "rating": _rating(by_passenger),
        "passenger_rating": _rating(by_passenger),
        "driver_rating": _rating(by_driver),
    }


def present_request(db: Session, request: RideRequest) -> dict:
    coords = repository.request_coords(db, request.id)
    ride = db.scalar(select(Ride).where(Ride.ride_request_id == request.id))
    return {
        "id": str(request.id),
        "status": request.status,
        "origin": coords["origin"],
        "destination": coords["destination"],
        "origin_label": request.origin_label,
        "destination_label": request.destination_label,
        "stops": request.stops,
        "service": request.service,
        "estimated_distance_m": request.estimated_distance_m,
        "estimated_duration_s": request.estimated_duration_s,
        "estimated_fare": money(request.estimated_fare),
        "route": request.route_geometry,
        "expires_at": request.expires_at.isoformat() if request.expires_at else None,
        "created_at": request.created_at.isoformat() if request.created_at else None,
        "ride": present_ride(db, ride) if ride else None,
        "counter_offers": _present_counters(db, request) if request.status in OPEN_REQUEST else [],
    }


def present_offer(db: Session, offer: RideOffer) -> dict:
    request = db.get(RideRequest, offer.ride_request_id)
    coords = repository.request_coords(db, request.id)
    pickup, pickup_eta, by_road = _pickup(db, offer, request)
    return {
        "id": str(offer.id),
        "request_id": str(request.id),
        "status": offer.status,
        "origin_label": request.origin_label,
        "destination_label": request.destination_label,
        "origin": coords["origin"],
        "destination": coords["destination"],
        "stops": request.stops,
        "stop_count": len(request.stops),
        "service": request.service,
        "route": request.route_geometry,
        "pickup_distance_m": pickup,
        "pickup_eta_s": pickup_eta,
        "pickup_by_road": by_road,
        "after_current_ride": offer.status in OPEN_OFFER and _active_ride_for_driver(db, offer.driver_id) is not None,
        "trip_distance_m": request.estimated_distance_m,
        "trip_duration_s": request.estimated_duration_s,
        "estimated_fare": money(request.estimated_fare),
        "min_counter_fare": money(request.estimated_fare),
        "proposed_fare": money(offer.proposed_fare),
        "counter_expires_at": _counter_deadline(offer),
        "offered_at": offer.offered_at.isoformat() if offer.offered_at else None,
    }


def _pickup(db: Session, offer: RideOffer, request: RideRequest) -> tuple[int | None, int | None, bool]:
    """Distancia y tiempo del conductor a la recogida: los medidos por calles al ofrecer, si existen.

    Sin ellos (Mapbox no respondió) se estima en línea recta a 25 km/h, y se indica con `False`.
    """
    if offer.pickup_eta_s is not None and offer.pickup_distance_m is not None:
        return offer.pickup_distance_m, offer.pickup_eta_s, True
    meters = repository.pickup_distance_m(db, offer.driver_id, request.id)
    return meters, int(meters / (25_000 / 3600)) if meters else None, False


def _counter_deadline(offer: RideOffer) -> str | None:
    if offer.status != "countered" or offer.countered_at is None:
        return None
    return (offer.countered_at + timedelta(seconds=settings.counter_ttl_seconds)).isoformat()


def _present_counters(db: Session, request: RideRequest) -> list[dict]:
    now = utcnow()
    offers = db.scalars(
        select(RideOffer)
        .where(RideOffer.ride_request_id == request.id, RideOffer.status == "countered")
        .order_by(RideOffer.proposed_fare)
    ).all()
    rows = []
    for offer in offers:
        deadline = offer.countered_at + timedelta(seconds=settings.counter_ttl_seconds)
        driver = db.get(Driver, offer.driver_id)
        account = db.get(User, driver.user_id) if driver else None
        if deadline <= now or driver is None or account is None:
            continue
        pickup, pickup_eta, by_road = _pickup(db, offer, request)
        rows.append(
            {
                "id": str(offer.id),
                "proposed_fare": money(offer.proposed_fare),
                "expires_at": deadline.isoformat(),
                # Segundos que quedan según el servidor: el teléfono cuenta desde aquí, sin depender de su reloj.
                "seconds_left": max(0, int((deadline - now).total_seconds())),
                "pickup_distance_m": pickup,
                "pickup_eta_s": pickup_eta,
                "pickup_by_road": by_road,
                "driver": {"name": account.name, "rating": float(driver.rating), "vehicle": _vehicle(db, driver.id)},
            }
        )
    return rows


async def build_estimate(
    db: Session,
    origin: tuple[float, float],
    destination: tuple[float, float],
    via: tuple[tuple[float, float], ...] = (),
) -> dict:
    from app.providers.routing import routing_provider

    route = await routing_provider.route(origin, destination, via)
    return {
        "distance_m": route.distance_m,
        "duration_s": route.duration_s,
        "fare": float(pricing.fare(db, "auto", route.distance_m)),
        "moto_fare": float(pricing.fare(db, "moto", route.distance_m)),
        "package_fare": float(pricing.fare(db, "paquete", route.distance_m)),
        "route": {"type": "LineString", "coordinates": route.geometry},
    }


def _favorite_ids(db: Session, passenger_id: UUID) -> list[UUID]:
    return list(
        db.scalars(select(FavoriteDriver.driver_id).where(FavoriteDriver.passenger_id == passenger_id)).all()
    )


def _offered_driver_ids(db: Session, request_id: UUID) -> list[UUID]:
    return list(db.scalars(select(RideOffer.driver_id).where(RideOffer.ride_request_id == request_id)).all())


def _expire_request(db: Session, request: RideRequest) -> None:
    now = utcnow()
    request.status = "expired"
    offers = db.scalars(
        select(RideOffer).where(RideOffer.ride_request_id == request.id, RideOffer.status.in_(OPEN_OFFER))
    ).all()
    for offer in offers:
        offer.status = "expired"
        offer.responded_at = now


def _open_next_wave(db: Session, request: RideRequest) -> None:
    now = utcnow()
    next_wave = min(request.wave + 1, len(WAVES))
    spec = WAVES[next_wave - 1]
    coords = repository.request_coords(db, request.id)
    origin = coords["origin"]
    if origin is None:
        _expire_request(db, request)
        return
    # PostGIS preselecciona a los más cercanos en línea recta; la Matrix API los ordena por ETA por calles.
    pool = repository.find_candidates(
        db,
        origin["latitude"],
        origin["longitude"],
        spec["radius"],
        min(spec["count"] * 2, MAX_CANDIDATES),
        _offered_driver_ids(db, request.id),
        _favorite_ids(db, request.passenger_id),
        request.service,
    )
    legs = pickup_legs(origin, pool)
    road = dict(zip((candidate.id for candidate in pool), legs, strict=True)) if legs else {}
    durations = [leg.seconds for leg in legs] if legs else None
    finishing = finishing_candidates(
        db, origin, spec["radius"], _offered_driver_ids(db, request.id), request.service
    )
    if finishing:
        # Quien está por terminar compite por tiempo total de llegada; sin Matrix API se estima en línea recta.
        road.update({candidate.id: leg for candidate, leg in finishing})
        pool = pool + [candidate for candidate, _ in finishing]
        durations = [
            road[c.id].seconds if c.id in road and road[c.id].seconds is not None else c.meters / URBAN_MPS
            for c in pool
        ]
    candidates = order_candidates(pool, durations, spec["count"])
    request.wave = next_wave
    request.wave_started_at = now
    if not candidates:
        # En el radio más amplio se reintenta en cada ciclo hasta que la solicitud venza.
        if next_wave < len(WAVES):
            _open_next_wave(db, request)
        return
    passenger = db.get(Passenger, request.passenger_id)
    for driver_id in candidates:
        leg = road.get(driver_id, Leg(None, None))
        offer = RideOffer(
            ride_request_id=request.id,
            driver_id=driver_id,
            status="pending",
            offered_at=now,
            pickup_distance_m=round(leg.meters) if leg.meters is not None else None,
            pickup_eta_s=round(leg.seconds) if leg.seconds is not None else None,
        )
        db.add(offer)
        driver = db.get(Driver, driver_id)
        if driver:
            notify(
                db,
                driver.user_id,
                "Nuevo viaje cerca de ti",
                request.destination_label or "Tienes una solicitud nueva",
                {"request_id": str(request.id)},
            )
        if passenger:
            passenger_user_id = passenger.user_id
            track(db, passenger_user_id, "ride_offered", {"request_id": str(request.id), "driver_id": str(driver_id)})
    request.status = "offered"


def advance_request(db: Session, request_id: UUID) -> None:
    request = db.scalar(select(RideRequest).where(RideRequest.id == request_id).with_for_update(skip_locked=True))
    if request is None or request.status not in OPEN_REQUEST:
        return
    now = utcnow()
    if request.expires_at and request.expires_at <= now:
        _expire_request(db, request)
        return
    counter_ttl = timedelta(seconds=settings.counter_ttl_seconds)
    countered = db.scalars(
        select(RideOffer).where(RideOffer.ride_request_id == request.id, RideOffer.status == "countered")
    ).all()
    for offer in countered:
        if offer.countered_at and offer.countered_at + counter_ttl <= now:
            offer.status = "expired"
            offer.responded_at = now
    pending = db.scalars(
        select(RideOffer).where(RideOffer.ride_request_id == request.id, RideOffer.status == "pending")
    ).all()
    still_waiting = []
    for offer in pending:
        driver = db.get(Driver, offer.driver_id)
        available = driver is not None and (
            driver.driver_status == "online" or (driver.driver_status == "busy" and _can_queue(db, driver.id))
        )
        if not available:
            offer.status = "expired"
            offer.responded_at = now
        else:
            still_waiting.append(offer)
    wait = WAVES[request.wave - 1]["wait"] if request.wave else 0
    if still_waiting and request.wave_started_at and now < request.wave_started_at + timedelta(seconds=wait):
        return
    for offer in still_waiting:
        offer.status = "expired"
        offer.responded_at = now
    _open_next_wave(db, request)


async def create_request(db: Session, user: User, payload) -> dict:
    passenger = passenger_for_user(db, user)
    if _active_ride_for_passenger(db, passenger.id) or _open_request(db, passenger.id):
        raise AppError(409, "Ya tienes un viaje en curso")
    ensure_pickup_allowed(payload.origin.latitude, payload.origin.longitude)
    estimate = await build_estimate(
        db,
        (payload.origin.latitude, payload.origin.longitude),
        (payload.destination.latitude, payload.destination.longitude),
        tuple((stop.latitude, stop.longitude) for stop in payload.stops),
    )
    now = utcnow()
    request_id = uuid4()
    repository.insert_request(
        db,
        {
            "id": request_id,
            "passenger_id": passenger.id,
            "origin_lat": payload.origin.latitude,
            "origin_lng": payload.origin.longitude,
            "destination_lat": payload.destination.latitude,
            "destination_lng": payload.destination.longitude,
            "origin_label": payload.origin_label,
            "destination_label": payload.destination_label,
            "distance_m": estimate["distance_m"],
            "duration_s": estimate["duration_s"],
            "fare": pricing.fare(db, payload.service, estimate["distance_m"]),
            "service": payload.service,
            "geometry": json.dumps(estimate["route"]),
            "stops": json.dumps([stop.model_dump() for stop in payload.stops]),
            "created_at": now,
            "expires_at": now + timedelta(seconds=settings.request_ttl_seconds),
        },
    )
    db.flush()
    audit(db, user.id, "ride_created", {"request_id": str(request_id)})
    track(db, user.id, "ride_requested", {"request_id": str(request_id)})
    advance_request(db, request_id)
    db.commit()
    request = db.get(RideRequest, request_id)
    return present_request(db, request)


NEARBY_RADIUS_M = 5000
NEARBY_LIMIT = 15


def nearby_drivers(db: Session, user: User) -> list[dict]:
    """Conductores disponibles cerca de la recogida mientras el pasajero espera.

    Son los mismos que podrían recibir la solicitud. La posición se redondea a unos 110 m y no
    lleva datos del conductor, para no exponer dónde está exactamente cada uno.
    """
    passenger = passenger_for_user(db, user)
    request = _open_request(db, passenger.id)
    origin = repository.request_coords(db, request.id)["origin"] if request else None
    if origin is None:
        return []
    pool = repository.find_candidates(
        db, origin["latitude"], origin["longitude"], NEARBY_RADIUS_M, NEARBY_LIMIT, [], [], request.service
    )
    return [{"latitude": round(c.latitude, 3), "longitude": round(c.longitude, 3)} for c in pool]


def cancel_request(db: Session, user: User, request_id: UUID) -> dict:
    passenger = passenger_for_user(db, user)
    request = db.scalar(select(RideRequest).where(RideRequest.id == request_id).with_for_update())
    if request is None or request.passenger_id != passenger.id:
        raise AppError(404, "No encontramos la solicitud")
    if request.status not in OPEN_REQUEST:
        raise AppError(409, "Esta solicitud ya no se puede cancelar")
    now = utcnow()
    request.status = "cancelled"
    for offer in db.scalars(
        select(RideOffer).where(RideOffer.ride_request_id == request.id, RideOffer.status.in_(OPEN_OFFER))
    ):
        offer.status = "expired"
        offer.responded_at = now
    db.commit()
    return present_request(db, request)


def list_offers(db: Session, user: User) -> list[dict]:
    driver = driver_for_user(db, user)
    offers = db.scalars(
        select(RideOffer)
        .where(RideOffer.driver_id == driver.id, RideOffer.status.in_(OPEN_OFFER))
        .order_by(RideOffer.offered_at.desc())
    ).all()
    visible = []
    for offer in offers:
        request = db.get(RideRequest, offer.ride_request_id)
        if request and request.status == "offered":
            visible.append(present_offer(db, offer))
    return visible


def _lock_offer(db: Session, offer_id: UUID) -> tuple[RideOffer, RideRequest]:
    offer = db.scalar(select(RideOffer).where(RideOffer.id == offer_id).with_for_update())
    if offer is None:
        raise AppError(404, "No encontramos la oferta")
    request = db.scalar(select(RideRequest).where(RideRequest.id == offer.ride_request_id).with_for_update())
    if request is None:
        raise AppError(404, "No encontramos la oferta")
    return offer, request


def _ensure_driver_available(db: Session, driver: Driver) -> None:
    busy = driver.driver_status == "busy" or _active_ride_for_driver(db, driver.id)
    if busy and not _can_queue(db, driver.id):
        raise AppError(409, "Ya tienes un viaje activo")
    from app.memberships.service import require_active_membership

    require_active_membership(db, driver)


def _assign(db: Session, actor: User, request: RideRequest, offer: RideOffer, driver: Driver) -> dict:
    """Crea el viaje con el conductor de la oferta y cierra las demás ofertas abiertas."""
    now = utcnow()
    request.status = "accepted"
    offer.status = "accepted"
    offer.responded_at = now
    others = db.scalars(
        select(RideOffer).where(
            RideOffer.ride_request_id == request.id,
            RideOffer.id != offer.id,
            RideOffer.status.in_(OPEN_OFFER),
        )
    ).all()
    for other in others:
        other.status = "expired"
        other.responded_at = now
    queued = _active_ride_for_driver(db, driver.id) is not None
    ride_id = uuid4()
    repository.insert_ride(
        db,
        {"id": ride_id, "request_id": request.id, "driver_id": driver.id, "created_at": now},
    )
    db.flush()
    ride = db.get(Ride, ride_id)
    driver.driver_status = "busy"
    _event(db, ride.id, "ride_accepted", {"driver_id": str(driver.id)})
    audit(db, actor.id, "ride_accepted", {"ride_id": str(ride.id)})
    track(db, actor.id, "ride_accepted", {"ride_id": str(ride.id)})
    passenger = db.get(Passenger, request.passenger_id)
    if passenger:
        body = "Tu conductor termina un viaje cerca y va hacia ti" if queued else "Un conductor aceptó tu viaje"
        notify(db, passenger.user_id, "Conductor asignado", body, {"ride_id": str(ride.id)})
    db.commit()
    publish(str(ride.id), {"type": "driver_arriving", "data": {"ride_id": str(ride.id)}})
    return present_ride(db, ride)


def accept_offer(db: Session, user: User, offer_id: UUID) -> dict:
    driver = driver_for_user(db, user)
    offer, request = _lock_offer(db, offer_id)
    if offer.driver_id != driver.id:
        raise AppError(404, "No encontramos la oferta")
    if request.status not in OPEN_REQUEST or offer.status != "pending":
        raise AppError(409, "Esta solicitud ya no está disponible")
    _ensure_driver_available(db, driver)
    return _assign(db, user, request, offer, driver)


def counter_offer(db: Session, user: User, offer_id: UUID, amount: Decimal) -> dict:
    """El conductor propone su precio: cualquiera por encima de la tarifa mínima del viaje.

    Args:
        db: Sesión de base de datos.
        user: Conductor que recibió la oferta.
        offer_id: Oferta a contraofertar.
        amount: Precio propuesto en pesos.

    Returns:
        La oferta con el precio propuesto y su vencimiento.
    """
    driver = driver_for_user(db, user)
    offer, request = _lock_offer(db, offer_id)
    if offer.driver_id != driver.id:
        raise AppError(404, "No encontramos la oferta")
    if request.status not in OPEN_REQUEST or offer.status != "pending":
        raise AppError(409, "Esta solicitud ya no está disponible")
    _ensure_driver_available(db, driver)
    floor = request.estimated_fare
    if floor is None:
        raise AppError(409, "Esta solicitud no admite contraoferta")
    amount = amount.quantize(Decimal("0.01"))
    if amount == floor:
        raise AppError(400, "Para cobrar la tarifa mínima, acepta el viaje")
    if amount < floor:
        raise AppError(400, f"El precio no puede ser menor a la tarifa mínima de ${floor}")
    offer.status = "countered"
    offer.proposed_fare = amount
    offer.countered_at = utcnow()
    passenger = db.get(Passenger, request.passenger_id)
    if passenger:
        notify(
            db,
            passenger.user_id,
            "Contraoferta",
            f"Un conductor propone ${amount} por tu viaje",
            {"request_id": str(request.id), "offer_id": str(offer.id)},
        )
    track(db, user.id, "ride_countered", {"request_id": str(request.id)})
    db.commit()
    return present_offer(db, offer)


def _own_counter(db: Session, user: User, offer_id: UUID) -> tuple[RideOffer, RideRequest]:
    passenger = passenger_for_user(db, user)
    offer, request = _lock_offer(db, offer_id)
    if request.passenger_id != passenger.id:
        raise AppError(404, "No encontramos la oferta")
    deadline = (offer.countered_at or utcnow()) + timedelta(seconds=settings.counter_ttl_seconds)
    if request.status not in OPEN_REQUEST or offer.status != "countered" or deadline <= utcnow():
        raise AppError(409, "La contraoferta ya no está disponible")
    return offer, request


def accept_counter(db: Session, user: User, offer_id: UUID) -> dict:
    """El pasajero acepta la contraoferta: el precio propuesto pasa a ser la tarifa del viaje."""
    offer, request = _own_counter(db, user, offer_id)
    driver = db.get(Driver, offer.driver_id)
    if driver is None:
        raise AppError(409, "La contraoferta ya no está disponible")
    try:
        _ensure_driver_available(db, driver)
    except AppError as error:
        raise AppError(409, "El conductor ya no está disponible") from error
    request.estimated_fare = offer.proposed_fare
    notify(db, driver.user_id, "Contraoferta aceptada", f"El pasajero aceptó ${offer.proposed_fare}", None)
    return _assign(db, user, request, offer, driver)


def decline_counter(db: Session, user: User, offer_id: UUID) -> dict:
    offer, request = _own_counter(db, user, offer_id)
    offer.status = "declined"
    offer.responded_at = utcnow()
    db.flush()
    advance_request(db, request.id)
    db.commit()
    return present_request(db, request)


def reject_offer(db: Session, user: User, offer_id: UUID, pause_minutes: int | None) -> dict:
    driver = driver_for_user(db, user)
    offer = db.get(RideOffer, offer_id)
    if offer is None or offer.driver_id != driver.id:
        raise AppError(404, "No encontramos la oferta")
    if offer.status != "pending":
        raise AppError(409, "Esta oferta ya fue respondida")
    offer.status = "rejected"
    offer.responded_at = utcnow()
    if pause_minutes:
        driver.driver_status = "paused"
        driver.paused_until = utcnow() + timedelta(minutes=pause_minutes)
    # Si ya nadie de la ronda puede aceptar, la siguiente se abre ahora y no en el próximo ciclo.
    # La sesión no hace autoflush: el rechazo se escribe antes de que advance_request lo consulte.
    db.flush()
    advance_request(db, offer.ride_request_id)
    db.commit()
    return {"status": "rejected"}


def _owned_ride(db: Session, user: User, ride_id: UUID, *, driver_only: bool = False) -> tuple[Ride, Driver | None, Passenger | None]:
    ride = db.scalar(select(Ride).where(Ride.id == ride_id).with_for_update())
    if ride is None:
        raise AppError(404, "No encontramos el viaje")
    driver = db.get(Driver, ride.driver_id)
    passenger = db.get(Passenger, ride.passenger_id)
    if driver_only:
        if driver is None or driver.user_id != user.id:
            raise AppError(403, "Este viaje no es tuyo")
        return ride, driver, passenger
    if user.role == "driver" and driver and driver.user_id == user.id:
        return ride, driver, passenger
    if user.role == "passenger" and passenger and passenger.user_id == user.id:
        return ride, driver, passenger
    if user.role == "admin":
        return ride, driver, passenger
    raise AppError(403, "Este viaje no es tuyo")


def _move(db: Session, user: User, ride_id: UUID, status: str, event_type: str) -> dict:
    ride, driver, _passenger = _owned_ride(db, user, ride_id, driver_only=True)
    if ride.status == status:
        # Un segundo toque o un reintento por red lenta: el viaje ya está donde se pidió.
        return present_ride(db, ride)
    if status not in TRANSITIONS.get(ride.status, set()):
        raise AppError(409, "Esa acción no corresponde al estado del viaje")
    ride.status = status
    if status == "in_progress":
        ride.started_at = utcnow()
    _event(db, ride.id, event_type)
    if event_type == "ride_started":
        audit(db, user.id, "ride_started", {"ride_id": str(ride.id)})
    db.commit()
    publish(str(ride.id), {"type": event_type, "data": {"ride_id": str(ride.id), "status": status}})
    return present_ride(db, ride)


def mark_arriving(db: Session, user: User, ride_id: UUID) -> dict:
    return _move(db, user, ride_id, "driver_arriving", "driver_arriving")


def mark_arrived(db: Session, user: User, ride_id: UUID) -> dict:
    return _move(db, user, ride_id, "driver_arrived", "driver_arrived")


def start_ride(db: Session, user: User, ride_id: UUID) -> dict:
    return _move(db, user, ride_id, "in_progress", "ride_started")


def mark_stop_arrived(db: Session, user: User, ride_id: UUID) -> dict:
    ride, _driver, _passenger = _owned_ride(db, user, ride_id, driver_only=True)
    request = db.get(RideRequest, ride.ride_request_id)
    stops = request.stops if request else []
    if ride.status != "in_progress" or ride.current_stop_index >= len(stops):
        raise AppError(409, "No hay una parada pendiente")
    if ride.stop_arrived:
        raise AppError(409, "Esta parada ya fue marcada")
    ride.stop_arrived = True
    _event(db, ride.id, "stop_arrived", {"index": ride.current_stop_index})
    db.commit()
    publish(str(ride.id), {"type": "stop_arrived", "data": {"index": ride.current_stop_index}})
    return present_ride(db, ride)


def continue_after_stop(db: Session, user: User, ride_id: UUID) -> dict:
    ride, _driver, _passenger = _owned_ride(db, user, ride_id, driver_only=True)
    request = db.get(RideRequest, ride.ride_request_id)
    stops = request.stops if request else []
    if ride.status != "in_progress" or ride.current_stop_index >= len(stops) or not ride.stop_arrived:
        raise AppError(409, "Primero marca que llegaste a la parada")
    ride.current_stop_index += 1
    ride.stop_arrived = False
    _event(db, ride.id, "stop_continued", {"next_index": ride.current_stop_index})
    db.commit()
    publish(str(ride.id), {"type": "stop_continued", "data": {"next_index": ride.current_stop_index}})
    return present_ride(db, ride)


def complete_ride(db: Session, user: User, ride_id: UUID, fare_amount, payment_method: str) -> dict:
    ride, driver, passenger = _owned_ride(db, user, ride_id, driver_only=True)
    if "completed" not in TRANSITIONS.get(ride.status, set()):
        raise AppError(409, "Este viaje no se puede finalizar")
    now = utcnow()
    request = db.get(RideRequest, ride.ride_request_id)
    if request and ride.current_stop_index < len(request.stops):
        raise AppError(409, "Completa las paradas antes de finalizar")
    ride.status = "completed"
    ride.completed_at = now
    from decimal import Decimal

    ride.fare_amount = Decimal(str(fare_amount)).quantize(Decimal("0.01"))
    ride.payment_method = payment_method
    ride.distance_m = request.estimated_distance_m if request else None
    if ride.started_at:
        ride.duration_s = max(int((now - ride.started_at).total_seconds()), 1)
    if driver:
        driver.completed_rides += 1
        # La sesión no hace autoflush: sin esto la consulta aún vería este viaje como activo.
        db.flush()
        if _active_ride_for_driver(db, driver.id) is None:
            _release_driver(db, driver)
    if passenger:
        passenger.total_rides += 1
        on_passenger_ride_completed(db, passenger.user_id)
        notify(db, passenger.user_id, "Viaje finalizado", "Puedes calificar al conductor", {"ride_id": str(ride.id)})
    _event(db, ride.id, "payment_method_selected", {"payment_method": payment_method})
    _event(db, ride.id, "ride_completed", {"fare_amount": str(fare_amount), "payment_method": payment_method})
    audit(db, user.id, "ride_completed", {"ride_id": str(ride.id)})
    track(db, user.id, "ride_completed", {"ride_id": str(ride.id)})
    db.commit()
    publish(str(ride.id), {"type": "ride_completed", "data": {"ride_id": str(ride.id)}})
    return present_ride(db, ride)


def cancel_ride(db: Session, user: User, ride_id: UUID) -> dict:
    ride, driver, passenger = _owned_ride(db, user, ride_id)
    if ride.status in {"completed", "cancelled"}:
        raise AppError(409, "Este viaje ya terminó")
    ride.status = "cancelled"
    if driver and driver.user_id == user.id:
        driver.cancelled_rides += 1
    db.flush()
    if driver and driver.driver_status == "busy" and _active_ride_for_driver(db, driver.id) is None:
        _release_driver(db, driver)
    _event(db, ride.id, "ride_cancelled", {"by": user.role})
    if passenger and passenger.user_id != user.id:
        notify(db, passenger.user_id, "Viaje cancelado", "El viaje no continuará", {"ride_id": str(ride.id)})
    if driver and driver.user_id != user.id:
        notify(db, driver.user_id, "Viaje cancelado", "El pasajero canceló el viaje", {"ride_id": str(ride.id)})
    db.commit()
    publish(str(ride.id), {"type": "ride_cancelled", "data": {"ride_id": str(ride.id)}})
    return present_ride(db, ride)


def get_ride(db: Session, user: User, ride_id: UUID) -> dict:
    ride, _driver, _passenger = _owned_ride(db, user, ride_id)
    db.commit()
    return present_ride(db, ride)


def get_request(db: Session, user: User, request_id: UUID) -> dict:
    passenger = passenger_for_user(db, user)
    request = db.get(RideRequest, request_id)
    if request is None or request.passenger_id != passenger.id:
        raise AppError(404, "No encontramos la solicitud")
    return present_request(db, request)


def active_for_passenger(db: Session, user: User) -> dict | None:
    passenger = passenger_for_user(db, user)
    ride = _active_ride_for_passenger(db, passenger.id)
    if ride:
        return {"ride": present_ride(db, ride), "request": None}
    request = _open_request(db, passenger.id)
    if request:
        return {"ride": None, "request": present_request(db, request)}
    pending = _pending_invoice(db, passenger_id=passenger.id, author_role="passenger")
    if pending:
        return {"ride": present_ride(db, pending), "request": None}
    return None


RECENT_WINDOW = timedelta(hours=1)


def recent_for_passenger(db: Session, user: User) -> dict | None:
    """Resultado de la última solicitud del pasajero si terminó hace menos de una hora.

    Args:
        db: Sesión de base de datos.
        user: Pasajero.

    Returns:
        La solicitud con ``outcome`` (completed, cancelled o expired) y ``cancelled_by``,
        o ``None`` si no hay nada reciente o el viaje sigue en curso.
    """
    passenger = passenger_for_user(db, user)
    request = db.scalar(
        select(RideRequest)
        .where(RideRequest.passenger_id == passenger.id)
        .order_by(RideRequest.created_at.desc())
        .limit(1)
    )
    if request is None or request.status in OPEN_REQUEST or request.created_at < utcnow() - RECENT_WINDOW:
        return None
    ride = db.scalar(select(Ride).where(Ride.ride_request_id == request.id))
    if ride is not None and ride.status in ACTIVE_RIDE:
        return None
    cancelled_by = None
    if ride is None:
        outcome = "cancelled" if request.status == "cancelled" else "expired"
        cancelled_by = "passenger" if outcome == "cancelled" else None
    else:
        outcome = ride.status
        if outcome == "cancelled":
            event = db.scalar(
                select(RideEvent)
                .where(RideEvent.ride_id == ride.id, RideEvent.event_type == "ride_cancelled")
                .order_by(RideEvent.created_at.desc())
            )
            cancelled_by = (event.metadata_json or {}).get("by") if event else None
    return {**present_request(db, request), "outcome": outcome, "cancelled_by": cancelled_by}


def active_for_driver(db: Session, user: User) -> dict | None:
    driver = driver_for_user(db, user)
    ride = _active_ride_for_driver(db, driver.id)
    if ride is None:
        pending = _pending_invoice(db, driver_id=driver.id, author_role="driver")
        return present_ride(db, pending) if pending else None
    return present_ride(db, ride)


def _pending_invoice(
    db: Session,
    *,
    author_role: str,
    passenger_id: UUID | None = None,
    driver_id: UUID | None = None,
) -> Ride | None:
    query = select(Ride).where(Ride.status == "completed").order_by(Ride.completed_at.desc())
    if passenger_id is not None:
        query = query.where(Ride.passenger_id == passenger_id)
    if driver_id is not None:
        query = query.where(Ride.driver_id == driver_id)
    ride = db.scalar(query.limit(1))
    if ride is None or ride.completed_at is None:
        return None
    if utcnow() - ride.completed_at > timedelta(hours=24):
        return None
    already = db.scalar(
        select(Rating).where(Rating.ride_id == ride.id, Rating.author_role == author_role)
    )
    if already:
        return None
    return ride


def history_for_passenger(db: Session, user: User) -> list[dict]:
    passenger = passenger_for_user(db, user)
    rides = db.scalars(
        select(Ride).where(Ride.passenger_id == passenger.id).order_by(Ride.created_at.desc()).limit(50)
    ).all()
    return [present_ride(db, ride) for ride in rides]


def history_for_driver(db: Session, user: User) -> list[dict]:
    driver = driver_for_user(db, user)
    rides = db.scalars(
        select(Ride).where(Ride.driver_id == driver.id).order_by(Ride.created_at.desc()).limit(50)
    ).all()
    return [present_ride(db, ride) for ride in rides]


def rate_ride(db: Session, user: User, ride_id: UUID, score: int, comment: str | None) -> dict:
    ride, driver, passenger = _owned_ride(db, user, ride_id)
    if ride.status != "completed":
        raise AppError(409, "El viaje todavía no termina")
    if user.role == "passenger":
        if passenger is None or passenger.user_id != user.id:
            raise AppError(403, "Solo el pasajero de este viaje puede calificar")
        author_role = "passenger"
    elif user.role == "driver":
        if driver is None or driver.user_id != user.id:
            raise AppError(403, "Solo el conductor de este viaje puede calificar")
        author_role = "driver"
    else:
        raise AppError(403, "No puedes calificar este viaje")

    existing = db.scalar(
        select(Rating).where(Rating.ride_id == ride.id, Rating.author_role == author_role)
    )
    if existing:
        raise AppError(409, "Este viaje ya tiene tu calificación")

    db.add(
        Rating(
            ride_id=ride.id,
            passenger_id=ride.passenger_id,
            driver_id=ride.driver_id,
            author_role=author_role,
            rating=score,
            comment=comment,
        )
    )
    if author_role == "passenger" and driver:
        db.flush()
        average = db.scalar(select(func.avg(Rating.rating)).where(Rating.driver_id == driver.id, Rating.author_role == "passenger"))
        driver.rating = round(float(average or score), 2)
        notify(db, driver.user_id, "Nueva calificación", f"Recibiste {score} estrellas", {"ride_id": str(ride.id)})
    if author_role == "driver" and passenger:
        notify(db, passenger.user_id, "Nueva calificación", f"El conductor te dio {score} estrellas", {"ride_id": str(ride.id)})
    db.commit()
    return present_ride(db, ride)

def tick(db: Session) -> None:
    from app.memberships.models import Membership
    from app.notifications.models import Notification

    now = utcnow()
    expired = db.scalars(select(Membership).where(Membership.status == "active", Membership.expires_at <= now)).all()
    for membership in expired:
        membership.status = "expired"
        driver = db.get(Driver, membership.driver_id)
        if driver and driver.driver_status in {"online", "paused"}:
            driver.driver_status = "offline"
    paused = db.scalars(
        select(Driver).where(Driver.driver_status == "paused", Driver.paused_until.is_not(None), Driver.paused_until <= now)
    ).all()
    for driver in paused:
        driver.driver_status = "online"
        driver.paused_until = None
    # Conductores marcados como ocupados sin ningún viaje activo (p. ej., por un error previo) vuelven a estar disponibles.
    stuck = db.scalars(
        select(Driver).where(
            Driver.driver_status == "busy",
            ~select(Ride.id).where(Ride.driver_id == Driver.id, Ride.status.in_(ACTIVE_RIDE)).exists(),
        )
    ).all()
    for driver in stuck:
        _release_driver(db, driver)
    open_ids = list(db.scalars(select(RideRequest.id).where(RideRequest.status.in_(OPEN_REQUEST))).all())
    for request_id in open_ids:
        advance_request(db, request_id)
    from app.memberships.service import active_membership

    online_drivers = db.scalars(select(Driver).where(Driver.driver_status == "online")).all()
    for driver in online_drivers:
        current = active_membership(db, driver.id)
        if current is None:
            continue
        remaining = (current.expires_at - now).total_seconds() / 86400
        if not 0 < remaining <= 3:
            continue
        already = db.scalar(
            select(Notification.id).where(
                Notification.user_id == driver.user_id,
                Notification.title == "Tu membresía está por vencer",
                Notification.created_at >= now - timedelta(hours=20),
            )
        )
        if already is None:
            notify(
                db,
                driver.user_id,
                "Tu membresía está por vencer",
                "Renueva para seguir recibiendo viajes",
                {"expires_at": current.expires_at.isoformat()},
            )
    review_documents(db)
    db.commit()
