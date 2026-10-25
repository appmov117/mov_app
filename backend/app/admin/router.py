from decimal import Decimal
from typing import Literal
from uuid import UUID

from app.admin.insights import broadcast, broadcasts, feedback, heatmap, memberships
from app.admin.motos import moto_overview
from app.admin.operations import list_rides, live, ride_detail
from app.admin.reviews import list_complaints, list_documents, review_document
from app.admin.service import (
    approve_payment,
    dashboard,
    driver_detail,
    list_drivers,
    list_passengers,
    list_payments,
    reject_payment,
    set_driver_access,
)
from app.complaints.service import review
from app.core.app_settings import (
    HALF_PAYMENT_LINK,
    PAYMENT_LINK,
    half_payment_url,
    payment_url,
    set_link,
)
from app.core.deps import require_role
from app.core.errors import AppError
from app.core.support import audit
from app.db.session import get_db
from app.rides.pricing import set_tariffs, tariffs
from app.users.models import User
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/admin", tags=["admin"])


class ReviewIn(BaseModel):
    status: str


class DocumentReviewIn(BaseModel):
    status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)


class BroadcastIn(BaseModel):
    audience: Literal["drivers", "passengers", "all"]
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=500)


@router.get("/dashboard")
def dash(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return dashboard(db)


@router.get("/drivers")
def drivers(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return list_drivers(db)


@router.get("/drivers/{driver_id}")
def driver(driver_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return driver_detail(db, driver_id)


@router.post("/drivers/{driver_id}/activate")
def activate(driver_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return set_driver_access(db, driver_id, active=True, admin=user)


@router.post("/drivers/{driver_id}/suspend")
def suspend(driver_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return set_driver_access(db, driver_id, active=False, admin=user)


@router.get("/passengers")
def passengers(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return list_passengers(db)


@router.get("/rides")
def rides(
    status: str = "all",
    service: str | None = None,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return list_rides(db, status, service)


@router.get("/rides/{ride_id}")
def ride(ride_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return ride_detail(db, ride_id)


@router.get("/live")
def live_view(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return live(db)


@router.get("/heatmap")
def heat(
    days: int = 7,
    kind: str = "demand",
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return heatmap(db, days, kind)


@router.get("/feedback")
def opinions(
    author_role: str | None = None,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return feedback(db, author_role)


@router.get("/documents")
def documents(
    status: str | None = None,
    driver_id: UUID | None = None,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return list_documents(db, status, driver_id)


@router.post("/documents/{document_id}")
def review_doc(
    document_id: UUID,
    data: DocumentReviewIn,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return review_document(db, user, document_id, data.status, data.note)


@router.get("/notifications")
def sent_notifications(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return broadcasts(db)


@router.post("/notifications")
def send_notification(data: BroadcastIn, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return broadcast(db, user, data.audience, data.title, data.body)


@router.get("/memberships")
def membership_overview(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return memberships(db)


@router.get("/payments")
def payments(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return list_payments(db)


@router.post("/payments/{payment_id}/approve")
def approve(payment_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return approve_payment(db, payment_id, user)


@router.post("/payments/{payment_id}/reject")
def reject(payment_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return reject_payment(db, payment_id)


@router.get("/complaints")
def complaints(
    status: str | None = None,
    author_role: str | None = None,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return list_complaints(db, status, author_role)


@router.get("/complaints/{complaint_id}")
def complaint(complaint_id: UUID, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = [row for row in list_complaints(db) if row["id"] == str(complaint_id)]
    if not rows:
        from app.core.errors import AppError

        raise AppError(404, "No encontramos la queja")
    return rows[0]


@router.post("/complaints/{complaint_id}")
def review_complaint(
    complaint_id: UUID,
    data: ReviewIn,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return review(db, user, complaint_id, data.status)


class PaymentLinkIn(BaseModel):
    url: str


LINKS = {"payment-link": PAYMENT_LINK, "half-payment-link": HALF_PAYMENT_LINK}


def _link_key(name: str) -> str:
    if name not in LINKS:
        raise AppError(404, "Ajuste no encontrado")
    return LINKS[name]


@router.get("/settings/{name}")
def payment_link(name: str, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    key = _link_key(name)
    return {"url": payment_url(db) if key == PAYMENT_LINK else half_payment_url(db)}


@router.put("/settings/{name}")
def update_payment_link(
    name: str, data: PaymentLinkIn, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)
):
    url = set_link(db, _link_key(name), data.url)
    audit(db, user.id, "payment_link_updated", {"setting": name, "url": url})
    db.commit()
    return {"url": url}


class TariffIn(BaseModel):
    base: Decimal = Field(ge=0, le=1000, max_digits=7, decimal_places=2)
    per_km: Decimal = Field(gt=0, le=1000, max_digits=7, decimal_places=2)


class TariffsIn(BaseModel):
    auto: TariffIn
    moto: TariffIn


def _present_tariffs(values: dict) -> dict:
    return {kind: {name: float(amount) for name, amount in tariff.items()} for kind, tariff in values.items()}


@router.get("/tariffs")
def get_tariffs(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return _present_tariffs(tariffs(db))


@router.put("/tariffs")
def update_tariffs(data: TariffsIn, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    values = set_tariffs(db, {"auto": data.auto.model_dump(), "moto": data.moto.model_dump()})
    audit(db, user.id, "tariffs_updated", _present_tariffs(values))
    db.commit()
    return _present_tariffs(values)


@router.get("/motos")
def motos(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return moto_overview(db)
