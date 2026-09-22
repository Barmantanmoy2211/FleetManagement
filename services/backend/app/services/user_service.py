from __future__ import annotations

import secrets
import string

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.core.dependencies import CurrentUser
from app.models import Role
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas import CreateUserRequest, CreateUserResponse, MeResponse, UserResponse


def _temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


class UserService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()
        settings = get_settings()
        self.cognito = boto3.client("cognito-idp", region_name=settings.cognito_region)
        self.user_pool_id = settings.cognito_user_pool_id

    def list_users(self, current: CurrentUser, tenant_id: str | None = None) -> list[UserResponse]:
        effective_tenant = self._resolve_tenant(current, tenant_id)
        items = self.repo.list_users_for_tenant(effective_tenant)
        return [self._to_response(i) for i in items]

    def create_user(self, current: CurrentUser, body: CreateUserRequest) -> CreateUserResponse:
        effective_tenant = self._resolve_tenant(current, body.tenantId)
        if not self.repo.ensure_tenant_exists(effective_tenant):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        if not self.user_pool_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cognito is not configured",
            )

        settings = get_settings()
        send_email = settings.send_invite_email

        generated_password = body.temporaryPassword is None
        temp_password = body.temporaryPassword or _temp_password()
        create_kwargs: dict = {
            "UserPoolId": self.user_pool_id,
            "Username": body.email,
            "TemporaryPassword": temp_password,
            "UserAttributes": [
                {"Name": "email", "Value": body.email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "custom:tenant_id", "Value": effective_tenant},
            ],
            "DesiredDeliveryMediums": ["EMAIL"],
        }
        if not send_email:
            create_kwargs["MessageAction"] = "SUPPRESS"

        try:
            cognito_resp = self.cognito.admin_create_user(**create_kwargs)
            cognito_sub = next(
                a["Value"]
                for a in cognito_resp["User"]["Attributes"]
                if a["Name"] == "sub"
            )
            self.cognito.admin_add_user_to_group(
                UserPoolId=self.user_pool_id,
                Username=body.email,
                GroupName=body.role.value,
            )
        except ClientError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=e.response.get("Error", {}).get("Message", "Cognito error"),
            ) from e

        item = self.repo.create_user_profile(
            tenant_id=effective_tenant,
            email=body.email,
            role=body.role,
            cognito_sub=cognito_sub,
            location_id=body.locationId,
            reports_to_user_id=body.reportsToUserId,
        )
        self.repo.write_audit(
            tenant_id=effective_tenant,
            actor_user_id=current.user_id,
            action="USER_CREATE",
            resource=f"user:{item['userId']}",
            after={"email": body.email, "role": body.role.value},
        )
        return CreateUserResponse(
            **self._to_response(item).model_dump(),
            temporaryPassword=(
                temp_password if (generated_password and not send_email) else None
            ),
            inviteEmailSent=send_email,
        )

    def get_me(self, current: CurrentUser) -> UserResponse | None:
        profile = self.repo.get_user_by_cognito_sub(current.cognito_sub)
        if profile:
            return self._to_response(profile)
        if current.role == Role.PLATFORM_ADMIN:
            return None
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found in tenant store",
        )

    def update_me(self, current: CurrentUser, time_zone: str) -> MeResponse:
        profile = self.repo.get_user_by_cognito_sub(current.cognito_sub)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found",
            )
        updated = self.repo.update_user_profile(
            profile["tenantId"],
            profile["userId"],
            {"timeZone": time_zone.strip()},
        )
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not update profile",
            )
        return MeResponse(
            userId=current.user_id,
            tenantId=updated["tenantId"],
            email=updated.get("email") or current.email or "",
            role=current.role,
            timeZone=updated.get("timeZone") or "Asia/Kolkata",
        )

    def me_response(self, current: CurrentUser, profile: UserResponse | None) -> MeResponse:
        tz = "Asia/Kolkata"
        if profile and profile.timeZone:
            tz = profile.timeZone
        return MeResponse(
            userId=current.user_id,
            tenantId=profile.tenantId if profile else current.tenant_id,
            email=current.email or (profile.email if profile else ""),
            role=current.role,
            timeZone=tz,
        )

    def _resolve_tenant(self, current: CurrentUser, requested: str | None) -> str:
        if current.role == Role.PLATFORM_ADMIN:
            if not requested:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="tenantId query/body required for platform admin",
                )
            return requested
        if not current.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant context missing",
            )
        if requested and requested != current.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-tenant access denied",
            )
        return current.tenant_id

    @staticmethod
    def _to_response(item: dict) -> UserResponse:
        return UserResponse(
            userId=item["userId"],
            tenantId=item["tenantId"],
            email=item["email"],
            role=Role(item["role"]),
            cognitoSub=item["cognitoSub"],
            locationId=item.get("locationId"),
            reportsToUserId=item.get("reportsToUserId"),
            timeZone=item.get("timeZone"),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
