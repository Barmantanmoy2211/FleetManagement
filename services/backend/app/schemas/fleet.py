from datetime import date

from pydantic import BaseModel, EmailStr, Field, computed_field

from app.models import (
    AssignmentStatus,
    DriverStatus,
    FuelType,
    LeaseOwnershipType,
    TripStatus,
    VehicleStatus,
    VehicleType,
)


def _vehicle_age(year: int | None) -> int | None:
    if year is None:
        return None
    return max(0, date.today().year - year)


class VehicleResponse(BaseModel):
    vehicleId: str
    tenantId: str
    locationId: str | None = None
    vehicleName: str
    registrationNumber: str
    vin: str | None = None
    make: str
    model: str
    year: int | None = None
    color: str | None = None
    dotNumber: str | None = None
    leaseOwnershipType: LeaseOwnershipType | None = None
    vehicleType: VehicleType
    vehicleSubtype: str | None = None
    fuelType: FuelType
    cargoType: str | None = None
    weightLbs: float | None = None
    policyNumber: str | None = None
    coveredUnderPolicy: bool = False
    status: VehicleStatus
    odometerKm: float | None = None
    currentDriverId: str | None = None
    currentAssignmentId: str | None = None
    lastLatitude: float | None = None
    lastLongitude: float | None = None
    createdAt: str
    updatedAt: str

    @computed_field  # type: ignore[prop-decorator]
    @property
    def displayVehicleId(self) -> str:
        return f"VEH-{self.vehicleId.replace('-', '')[:8].upper()}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def age(self) -> int | None:
        return _vehicle_age(self.year)


class CreateVehicleRequest(BaseModel):
    vehicleName: str = Field(min_length=1, max_length=160)
    registrationNumber: str | None = Field(default=None, max_length=32)
    vin: str | None = Field(default=None, max_length=32)
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    year: int = Field(ge=1980, le=2100)
    color: str | None = Field(default=None, max_length=80)
    dotNumber: str | None = Field(default=None, max_length=32)
    leaseOwnershipType: LeaseOwnershipType | None = None
    vehicleType: VehicleType = VehicleType.TRUCK
    vehicleSubtype: str | None = Field(default=None, max_length=80)
    fuelType: FuelType = FuelType.DIESEL
    cargoType: str | None = Field(default=None, max_length=80)
    weightLbs: float | None = Field(default=None, ge=0)
    policyNumber: str | None = Field(default=None, max_length=64)
    coveredUnderPolicy: bool = False
    status: VehicleStatus = VehicleStatus.AVAILABLE
    odometerKm: float | None = Field(default=None, ge=0)
    tenantId: str | None = None
    locationId: str | None = None


class UpdateVehicleRequest(BaseModel):
    vehicleName: str | None = Field(default=None, min_length=1, max_length=160)
    registrationNumber: str | None = Field(default=None, min_length=1, max_length=32)
    vin: str | None = Field(default=None, max_length=32)
    make: str | None = Field(default=None, min_length=1, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1980, le=2100)
    color: str | None = Field(default=None, max_length=80)
    dotNumber: str | None = Field(default=None, max_length=32)
    leaseOwnershipType: LeaseOwnershipType | None = None
    vehicleType: VehicleType | None = None
    vehicleSubtype: str | None = Field(default=None, max_length=80)
    fuelType: FuelType | None = None
    cargoType: str | None = Field(default=None, max_length=80)
    weightLbs: float | None = Field(default=None, ge=0)
    policyNumber: str | None = Field(default=None, max_length=64)
    coveredUnderPolicy: bool | None = None
    status: VehicleStatus | None = None
    odometerKm: float | None = Field(default=None, ge=0)


class ImportVehicleRowError(BaseModel):
    row: int
    message: str


class ImportVehiclesResponse(BaseModel):
    created: int
    failed: int
    errors: list[ImportVehicleRowError]
    vehicles: list[VehicleResponse]


class DriverResponse(BaseModel):
    driverId: str
    tenantId: str
    locationId: str | None = None
    name: str
    email: EmailStr | None = None
    phone: str | None = None
    licenseNumber: str
    licenseType: str | None = None
    licenseExpiry: date | None = None
    status: DriverStatus
    emergencyContact: str | None = None
    joiningDate: date | None = None
    currentVehicleId: str | None = None
    currentAssignmentId: str | None = None
    linkedUserId: str | None = None
    createdAt: str
    updatedAt: str


class CreateDriverRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    licenseNumber: str = Field(min_length=1, max_length=64)
    licenseType: str | None = Field(default=None, max_length=64)
    licenseExpiry: date | None = None
    emergencyContact: str | None = Field(default=None, max_length=120)
    joiningDate: date | None = None
    tenantId: str | None = None


class UpdateDriverRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    licenseNumber: str | None = Field(default=None, min_length=1, max_length=64)
    licenseType: str | None = Field(default=None, max_length=64)
    licenseExpiry: date | None = None
    status: DriverStatus | None = None
    emergencyContact: str | None = Field(default=None, max_length=120)
    joiningDate: date | None = None


class AssignmentResponse(BaseModel):
    assignmentId: str
    tenantId: str
    locationId: str | None = None
    driverId: str
    vehicleId: str
    changeDate: date
    releaseDate: date | None = None
    startTime: str
    endTime: str | None = None
    status: AssignmentStatus
    assignedBy: str
    createdAt: str
    updatedAt: str


class CreateAssignmentRequest(BaseModel):
    driverId: str
    vehicleId: str
    changeDate: date
    releaseDate: date | None = None
    tenantId: str | None = None


class UpdateAssignmentRequest(BaseModel):
    changeDate: date | None = None
    releaseDate: date | None = None


class TripResponse(BaseModel):
    tripId: str
    tenantId: str
    assignmentId: str
    driverId: str
    vehicleId: str
    status: TripStatus
    scheduledStartTime: str
    scheduledEndTime: str
    actualStartTime: str | None = None
    pickupLatitude: float
    pickupLongitude: float
    destinationLatitude: float
    destinationLongitude: float
    routeDistanceKm: float
    timeTakenMinutes: float | None = None
    fuelRequiredLiters: float | None = None
    startTime: str
    endTime: str | None = None
    lastLatitude: float | None = None
    lastLongitude: float | None = None
    startedBy: str
    createdAt: str
    updatedAt: str


class CreateTripRequest(BaseModel):
    assignmentId: str
    scheduledStartTime: str
    scheduledEndTime: str
    pickupLatitude: float = Field(ge=-90, le=90)
    pickupLongitude: float = Field(ge=-180, le=180)
    destinationLatitude: float = Field(ge=-90, le=90)
    destinationLongitude: float = Field(ge=-180, le=180)
    tenantId: str | None = None


class UpdateTripRequest(BaseModel):
    scheduledStartTime: str | None = None
    scheduledEndTime: str | None = None
    pickupLatitude: float | None = Field(default=None, ge=-90, le=90)
    pickupLongitude: float | None = Field(default=None, ge=-180, le=180)
    destinationLatitude: float | None = Field(default=None, ge=-90, le=90)
    destinationLongitude: float | None = Field(default=None, ge=-180, le=180)


class StartTripRequest(BaseModel):
    """Legacy alias: immediate trip with a default 8h window ending at scheduledEndTime."""

    assignmentId: str
    tenantId: str | None = None


class UpdateTripLocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class EndTripRequest(BaseModel):
    cancel: bool = False
    fuelRequiredLiters: float | None = Field(default=None, gt=0, le=100_000)


class SyncDriversResponse(BaseModel):
    created: int
    drivers: list[DriverResponse]


class DriverImportCandidate(BaseModel):
    userId: str
    email: EmailStr
    suggestedName: str


class ImportDriversFromUsersRequest(BaseModel):
    userIds: list[str] = Field(min_length=1)
    tenantId: str | None = None
