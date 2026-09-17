from functools import lru_cache

import httpx
from jose import JWTError, jwt

from app.core.config import get_settings


@lru_cache
def _jwks_url() -> str:
    settings = get_settings()
    region = settings.cognito_region
    pool_id = settings.cognito_user_pool_id
    return f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"


@lru_cache
def _issuer() -> str:
    settings = get_settings()
    return f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/{settings.cognito_user_pool_id}"


_jwks_cache: dict | None = None


def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(_jwks_url())
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


def decode_bearer_token(token: str) -> dict:
    settings = get_settings()
    if not settings.cognito_user_pool_id:
        raise JWTError("Cognito user pool not configured")

    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    jwks = _get_jwks()
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key:
        raise JWTError("Unable to find matching JWK")

    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=None,
        issuer=_issuer(),
        options={"verify_aud": False},
    )
