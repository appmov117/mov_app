from pathlib import Path
from uuid import uuid4

from app.core import storage
from app.core.deps import require_role
from app.db.session import get_db
from app.memberships.service import create_payment, membership_view, payment_history, renewal_terms
from app.rides.service import driver_for_user
from app.users.models import User
from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/drivers/me/membership", tags=["memberships"])


class PaymentIn(BaseModel):
    reference: str | None = None


@router.get("")
def current(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    driver = driver_for_user(db, user)
    return membership_view(db, driver.id)


@router.get("/payments")
def payments(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    return payment_history(db, driver_for_user(db, user).id)


@router.post("/payment")
def payment(data: PaymentIn, user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    driver = driver_for_user(db, user)
    _price, url, _discount = renewal_terms(db, driver.id)
    row = create_payment(db, driver.id, "mercado_pago_link", data.reference, None)
    db.commit()
    return {
        "payment_id": str(row.id),
        "status": row.status,
        "payment_url": url,
        "amount": float(row.amount),
    }


@router.post("/receipt")
async def receipt(
    file: UploadFile = File(...),
    user: User = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    driver = driver_for_user(db, user)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        from app.core.errors import AppError

        raise AppError(400, "Sube una imagen o un PDF")
    content = await file.read()
    key = f"receipts/{uuid4()}{ext}"
    storage.save(key, content)
    row = create_payment(db, driver.id, "bank_transfer", None, key)
    db.commit()
    return {"payment_id": str(row.id), "status": "pending"}
