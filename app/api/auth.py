from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import get_settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=20)


class RegionRequest(BaseModel):
    state_code: str = Field(min_length=2, max_length=8)
    state_name: str = Field(min_length=1, max_length=120)
    district_name: str = Field(min_length=1, max_length=120)


def _secret() -> str:
    secret = get_settings().jwt_secret
    if not secret:
        raise HTTPException(status_code=503, detail={"code": "auth_not_configured", "message": "Set JWT_SECRET and GOOGLE_CLIENT_ID in the backend environment."})
    return secret


@router.post("/google")
async def login_with_google(payload: GoogleLoginRequest):
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail={"code": "google_auth_not_configured", "message": "Set GOOGLE_CLIENT_ID before enabling Google sign-in."})

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": payload.credential})
        response.raise_for_status()
        claims = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=401, detail={"code": "invalid_google_credential", "message": "Google token is expired or invalid. Please click and select your account again."}) from exc

    aud = claims.get("aud") or claims.get("client_id")
    if aud != settings.google_client_id:
        raise HTTPException(status_code=401, detail={"code": "client_id_mismatch", "message": f"Client ID mismatch (aud: {aud})."})
    
    email_verified = claims.get("email_verified")
    if email_verified not in (True, "true", "True", 1, "1"):
        raise HTTPException(status_code=401, detail={"code": "unverified_google_account", "message": "Use a verified Google account registered for this application."})

    now = datetime.now(timezone.utc)
    user = {"sub": claims.get("sub"), "email": claims.get("email"), "name": claims.get("name") or claims.get("email")}
    access_token = jwt.encode({**user, "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes)}, _secret(), algorithm="HS256")
    return {"access_token": access_token, "token_type": "bearer", "user": user}


def current_user(authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"code": "missing_token", "message": "Sign in is required."})
    try:
        return jwt.decode(authorization[7:], _secret(), algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": "Your session expired. Sign in again."}) from exc


@router.post("/region")
async def save_region(payload: RegionRequest, user=Depends(current_user)):
    # This validates the authenticated hand-off. Persisting the preference needs a users/profile collection.
    return {"user": user, "region": payload.model_dump(), "persisted": False}
