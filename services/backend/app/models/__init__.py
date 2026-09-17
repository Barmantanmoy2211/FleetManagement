from enum import StrEnum


class TenantStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    INACTIVE = "INACTIVE"


class Role(StrEnum):
    PLATFORM_ADMIN = "PlatformAdmin"
    FLEET_ADMIN = "FleetAdmin"
    FLEET_MANAGER = "FleetManager"
    DRIVER = "Driver"
    VIEWER = "Viewer"
