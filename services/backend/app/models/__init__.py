from enum import StrEnum


class TenantStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    INACTIVE = "INACTIVE"


class Role(StrEnum):
    PLATFORM_ADMIN = "PlatformAdmin"
    FLEET_ADMIN = "FleetAdmin"
    LOCATION_HEAD = "LocationHead"
    FLEET_MANAGER = "FleetManager"
    DRIVER = "Driver"
    VIEWER = "Viewer"


class VehicleStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    IN_TRIP = "IN_TRIP"
    IDLE = "IDLE"
    MAINTENANCE = "MAINTENANCE"
    OFFLINE = "OFFLINE"
    INACTIVE = "INACTIVE"


class DriverStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    ON_TRIP = "ON_TRIP"
    ON_BREAK = "ON_BREAK"
    OFF_DUTY = "OFF_DUTY"
    SUSPENDED = "SUSPENDED"
    INACTIVE = "INACTIVE"


class AssignmentStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"


class TripStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class VehicleType(StrEnum):
    TRUCK = "TRUCK"
    VAN = "VAN"
    CAR = "CAR"
    BUS = "BUS"
    BIKE = "BIKE"
    OTHER = "OTHER"


class FuelType(StrEnum):
    DIESEL = "DIESEL"
    PETROL = "PETROL"
    CNG = "CNG"
    ELECTRIC = "ELECTRIC"
    HYBRID = "HYBRID"
    OTHER = "OTHER"


class LeaseOwnershipType(StrEnum):
    LEASE = "LEASE"
    OWNED = "OWNED"
    RENTED = "RENTED"
    OTHER = "OTHER"


class EmployeeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ON_LEAVE = "ON_LEAVE"
    TERMINATED = "TERMINATED"


class Gender(StrEnum):
    MALE = "Male"
    FEMALE = "Female"
    OTHER = "Other"
    PREFER_NOT_TO_SAY = "PreferNotToSay"


class EmployeePersona(StrEnum):
    FLEET_ADMIN = "Fleet Admin"
    LOCATION_HEAD = "Location Head"
    FLEET_MANAGER = "Fleet Manager"
    DRIVER = "Driver"


class LocationStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
