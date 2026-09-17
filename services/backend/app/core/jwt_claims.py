from __future__ import annotations

from fastapi import Request
from jose import JWTError, jwt


def load_jwt_claims(request: Request) -> dict | None:
    """Build JWT claims for the current request.

    API Gateway HTTP API JWT authorizers validate the token at the edge but often
    pass a reduced claim set to Lambda. The Authorization header still contains the
    full token, so we merge unverified claims (safe post-gateway) with authorizer claims.
    """
    claims: dict = {}
    gateway_claims = getattr(request.state, "jwt_claims", None)
    if isinstance(gateway_claims, dict):
        claims.update(gateway_claims)

    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            token_claims = jwt.get_unverified_claims(token)
            if isinstance(token_claims, dict):
                # Token claims win for group membership and custom attributes.
                claims = {**claims, **token_claims}
        except JWTError:
            pass

    return claims or None
