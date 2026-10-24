from app.core.deps import require_role
from app.db.session import get_db
from app.referrals.service import list_referrals, summary
from app.rides.service import driver_for_user
from app.users.models import User
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/drivers/me", tags=["referrals"])


@router.get("/referral")
def referral(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    driver = driver_for_user(db, user)
    payload = summary(db, driver)
    db.commit()
    return payload


@router.get("/referrals")
def referrals(user: User = Depends(require_role("driver")), db: Session = Depends(get_db)):
    driver = driver_for_user(db, user)
    return list_referrals(db, driver)
