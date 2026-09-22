from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import assignments, drivers, employees, health, locations, me, tenants, trips, users, vehicles
from app.core.config import get_settings
from app.core.middleware import ApiGatewayJwtMiddleware

settings = get_settings()

app = FastAPI(title="Fleet Intelligence API", version="0.1.0")

app.add_middleware(ApiGatewayJwtMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(tenants.router, prefix="/api/v1")
app.include_router(locations.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(vehicles.router, prefix="/api/v1")
app.include_router(drivers.router, prefix="/api/v1")
app.include_router(assignments.router, prefix="/api/v1")
app.include_router(trips.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"service": "fleet-backend", "docs": "/docs"}
