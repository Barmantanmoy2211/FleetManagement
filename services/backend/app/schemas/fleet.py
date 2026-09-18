from datetime import date

from pydantic import BaseModel, EmailStr, Field, computed_field

from app.models import (
    AssignmentStatus,
    DriverStatus,
    FuelType,
    LeaseOwnershipType,
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
    driverId: str
    vehicleId: str
    startTime: str
    endTime: str | None = None
    status: AssignmentStatus
    assignedBy: str
    createdAt: str
    updatedAt: str


class CreateAssignmentRequest(BaseModel):
    driverId: str
    vehicleId: str
    tenantId: str | None = None


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
