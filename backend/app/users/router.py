from app.core.deps import get_current_user
from app.db.session import get_db
from app.users.avatar import load_avatar, save_avatar
from app.users.models import User
from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

router = APIRouter(tags=["users"])


@router.post("/users/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    return {"avatar_url": save_avatar(db, user, file.content_type, content)}


@router.get("/avatars/{name}")
def avatar(name: str):
    # Sin sesión: una etiqueta <img> no envía el token. El nombre es un UUID imposible de adivinar.
    content, mime = load_avatar(name)
    return Response(content, media_type=mime, headers={"Cache-Control": "public, max-age=31536000, immutable"})
