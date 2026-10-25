from uuid import UUID

from app.core.deps import get_current_user, require_role
from app.core.rate_limit import hit
from app.db.session import get_db
from app.rides import extras
from app.rides.schemas import CompleteIn, CounterIn, RejectIn, RideRequestIn, StartIn
from app.rides.service import (
    accept_counter,
    accept_offer,
    build_estimate,
    cancel_request,
    cancel_ride,
    complete_ride,
    continue_after_stop,
    counter_offer,
    create_request,
    decline_counter,
    get_request,
    get_ride,
    mark_arrived,
    mark_arriving,
    mark_stop_arrived,
    nearby_drivers,
    owned_ride,
    reject_offer,
    start_ride,
)
from app.rides.zones import ensure_pickup_allowed
from app.users.models import User
from fastapi import APIRouter, Body, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

router = APIRouter(tags=["rides"])


@router.post("/ride-requests/estimate")
async def estimate(
    data: RideRequestIn, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)
):
    ensure_pickup_allowed(data.origin.latitude, data.origin.longitude)
    return await build_estimate(
        db,
        (data.origin.latitude, data.origin.longitude),
        (data.destination.latitude, data.destination.longitude),
        tuple((stop.latitude, stop.longitude) for stop in data.stops),
    )


@router.get("/passengers/me/nearby-drivers")
def nearby(user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return nearby_drivers(db, user)


@router.post("/ride-requests")
async def create(data: RideRequestIn, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    hit(f"ride-request:{user.id}", limit=6, window_seconds=60)
    return await create_request(db, user, data)


@router.get("/ride-requests/{request_id}")
def read_request(request_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return get_request(db, user, request_id)


@router.post("/ride-requests/{request_id}/cancel")
def cancel(request_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return cancel_request(db, user, request_id)


@router.post("/ride-offers/{offer_id}/accept")
def accept(offer_id: UUID, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return accept_offer(db, user, offer_id)


@router.post("/ride-offers/{offer_id}/counter")
def counter(
    offer_id: UUID,
    data: CounterIn,
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    return counter_offer(db, user, offer_id, data.amount)


@router.post("/ride-offers/{offer_id}/counter/accept")
def counter_accept(offer_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return accept_counter(db, user, offer_id)


@router.post("/ride-offers/{offer_id}/counter/decline")
def counter_decline(offer_id: UUID, user: User = Depends(require_role("passenger")), db: Session = Depends(get_db)):
    return decline_counter(db, user, offer_id)


@router.post("/ride-offers/{offer_id}/reject")
def reject(
    offer_id: UUID,
    data: RejectIn | None = None,
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    minutes = data.pause_minutes if data else None
    return reject_offer(db, user, offer_id, minutes)


@router.get("/rides/{ride_id}")
def read_ride(ride_id: UUID, user: User = Depends(require_role("passenger", "driver", "admin")), db: Session = Depends(get_db)):
    return get_ride(db, user, ride_id)


@router.post("/rides/{ride_id}/arriving")
def arriving(ride_id: UUID, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return mark_arriving(db, user, ride_id)


@router.post("/rides/{ride_id}/arrived")
def arrived(ride_id: UUID, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return mark_arrived(db, user, ride_id)


@router.post("/rides/{ride_id}/start")
def start(
    ride_id: UUID,
    data: StartIn | None = Body(default=None),
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    return start_ride(db, user, ride_id, data.pin if data else None)


@router.post("/rides/{ride_id}/delivery-photo")
async def delivery_photo(
    ride_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    ride, _driver, _passenger = owned_ride(db, user, ride_id, driver_only=True)
    extras.save_delivery_photo(db, ride, file.content_type, await file.read())
    return {"ok": True}


@router.get("/rides/{ride_id}/delivery-photo")
def get_delivery_photo(ride_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ride, _driver, _passenger = owned_ride(db, user, ride_id)
    content, mime = extras.load_delivery_photo(ride)
    return Response(content, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})


@router.post("/rides/{ride_id}/stops/arrived")
def stop_arrived(ride_id: UUID, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return mark_stop_arrived(db, user, ride_id)


@router.post("/rides/{ride_id}/stops/continue")
def stop_continue(ride_id: UUID, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return continue_after_stop(db, user, ride_id)


@router.post("/rides/{ride_id}/complete")
def complete(ride_id: UUID, data: CompleteIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    if data.payment_method not in {"cash", "driver_terminal", "other"}:
        from app.core.errors import AppError

        raise AppError(400, "Elige efectivo, terminal u otro")
    return complete_ride(db, user, ride_id, data.fare_amount, data.payment_method, data.delivery_code)


@router.post("/rides/{ride_id}/cancel")
def cancel_existing(
    ride_id: UUID, user: User = Depends(require_role("passenger", "driver")), db: Session = Depends(get_db)
):
    return cancel_ride(db, user, ride_id)
