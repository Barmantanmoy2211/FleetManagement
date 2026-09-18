from datetime import date

from pydantic import BaseModel, EmailStr, Field

from app.models import AssignmentStatus, DriverStatus, FuelType, VehicleStatus, VehicleType


class VehicleResponse(BaseModel):
    vehicleId: str
    tenantId: str
    registrationNumber: str
    vin: str | None = None
    make: str
    model: str
    year: int | None = None
    vehicleType: VehicleType
    fuelType: FuelType
    status: VehicleStatus
    odometerKm: float | None = None
    currentDriverId: str | None = None
    currentAssignmentId: str | None = None
    createdAt: str
    updatedAt: str


class CreateVehicleRequest(BaseModel):
    registrationNumber: str = Field(min_length=1, max_length=32)
    vin: str | None = Field(default=None, max_length=32)
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1980, le=2100)
    vehicleType: VehicleType = VehicleType.OTHER
    fuelType: FuelType = FuelType.DIESEL
    odometerKm: float | None = Field(default=None, ge=0)
    tenantId: str | None = None


class UpdateVehicleRequest(BaseModel):
    registrationNumber: str | None = Field(default=None, min_length=1, max_length=32)
    vin: str | None = Field(default=None, max_length=32)
    make: str | None = Field(default=None, min_length=1, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1980, le=2100)
    vehicleType: VehicleType | None = None
    fuelType: FuelType | None = None
    status: VehicleStatus | None = None
    odometerKm: float | None = Field(default=None, ge=0)


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
