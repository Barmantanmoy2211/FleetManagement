from datetime import date
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import Role, TenantStatus
from app.schemas.fleet import DriverResponse, VehicleResponse


class HealthResponse(BaseModel):
    status: str
    service: str


class TenantResponse(BaseModel):
    tenantId: str
    name: str
    status: TenantStatus
    street: str | None = None
    city: str | None = None
    zipCode: str | None = None
    state: str | None = None
    country: str | None = None
    landmark: str | None = None
    revenue: float | None = None
    establishedDate: date | None = None
    platformOnboardingDate: date | None = None
    createdAt: str
    updatedAt: str

    @field_validator("revenue", mode="before")
    @classmethod
    def _coerce_revenue(cls, v: object) -> float | None:
        if v is None:
            return None
        if isinstance(v, Decimal):
            return float(v)
        return float(v)


class CreateTenantRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    status: TenantStatus = TenantStatus.ACTIVE
    street: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=120)
    zipCode: str | None = Field(default=None, max_length=32)
    state: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    landmark: str | None = Field(default=None, max_length=200)
    revenue: float | None = Field(default=None, ge=0)
    establishedDate: date | None = None


class UpdateTenantRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: TenantStatus | None = None
    street: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=120)
    zipCode: str | None = Field(default=None, max_length=32)
    state: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    landmark: str | None = Field(default=None, max_length=200)
    revenue: float | None = Field(default=None, ge=0)
    establishedDate: date | None = None


class UserResponse(BaseModel):
    userId: str
    tenantId: str
    email: EmailStr
    role: Role
    cognitoSub: str
    createdAt: str
    updatedAt: str


class CreateUserRequest(BaseModel):
    email: EmailStr
    role: Role
    tenantId: str | None = None
    temporaryPassword: str | None = Field(default=None, min_length=8)


class CreateUserResponse(UserResponse):
    """Returned once when inviting a user."""

    temporaryPassword: str | None = None
    inviteEmailSent: bool = False


class MeResponse(BaseModel):
    userId: str
    tenantId: str | None
    email: str
    role: Role


class TenantDetailResponse(BaseModel):
    tenant: TenantResponse
    users: list[UserResponse]
    fleetAdmins: list[UserResponse]
    fleetManagers: list[UserResponse]
    drivers: list[DriverResponse]
    vehicles: list[VehicleResponse]
    linkedDriverCount: int = 0
