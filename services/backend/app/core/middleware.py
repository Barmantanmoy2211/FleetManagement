from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class ApiGatewayJwtMiddleware(BaseHTTPMiddleware):
    """Copy API Gateway HTTP API JWT claims into request.state for FastAPI dependencies."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        aws_event = request.scope.get("aws.event")
        if aws_event and not getattr(request.state, "jwt_claims", None):
            try:
                claims = aws_event["requestContext"]["authorizer"]["jwt"]["claims"]
                request.state.jwt_claims = claims
            except (KeyError, TypeError):
                pass
        return await call_next(request)
