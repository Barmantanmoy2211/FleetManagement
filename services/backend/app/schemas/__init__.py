from pydantic import BaseModel, EmailStr, Field

from app.models import Role, TenantStatus


class HealthResponse(BaseModel):
    status: str
    service: str


class TenantResponse(BaseModel):
    tenantId: str
    name: str
    status: TenantStatus
    createdAt: str
    updatedAt: str


class CreateTenantRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    status: TenantStatus = TenantStatus.ACTIVE


class UpdateTenantRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: TenantStatus | None = None


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
