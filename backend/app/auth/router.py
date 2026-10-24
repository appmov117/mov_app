from app.auth.schemas import LoginIn, RefreshIn, RegisterIn, TokenOut
from app.auth.service import login, logout, public_user, refresh, register
from app.core.deps import get_current_user
from app.core.rate_limit import client_ip, hit
from app.db.session import get_db
from app.users.models import User
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.requests import Request

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
def register_route(data: RegisterIn, request: Request, db: Session = Depends(get_db)):
    hit(f"register:{client_ip(request)}", limit=10, window_seconds=60)
    tokens = register(db, data)
    return tokens


@router.post("/login", response_model=TokenOut)
def login_route(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    hit(f"login:{client_ip(request)}", limit=10, window_seconds=60)
    return login(db, data.identifier, data.password)


@router.post("/refresh", response_model=TokenOut)
def refresh_route(data: RefreshIn, db: Session = Depends(get_db)):
    return refresh(db, data.refresh_token)


@router.post("/logout")
def logout_route(data: RefreshIn, db: Session = Depends(get_db)):
    logout(db, data.refresh_token)
    return {"ok": True}


@router.get("/me")
def me_route(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return public_user(db, user)
