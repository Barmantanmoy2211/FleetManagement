from datetime import date

from pydantic import BaseModel, EmailStr, Field, computed_field

from app.models import EmployeeStatus, Gender, EmployeePersona


class EmployeeResponse(BaseModel):
    employeeId: str
    tenantId: str
    name: str
    employeeCode: str | None = None
    dateOfBirth: date | None = None
    gender: Gender | None = None
    status: EmployeeStatus
    persona: EmployeePersona | None = None
    isDriver: bool = False
    hireDate: date | None = None
    homeAddress: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    primaryContact: bool = False
    city: str | None = None
    state: str | None = None
    zipCode: str | None = None
    country: str | None = None
    emergencyContactName: str | None = None
    emergencyContactAddress: str | None = None
    employmentType: str | None = None
    employmentStatus: str | None = None
    experience: str | None = None
    dailyHoursWorked: float | None = None
    companyDriverId: str | None = None
    department: str | None = None
    jobRole: str | None = None
    linkedUserId: str | None = None
    createdAt: str
    updatedAt: str

    @computed_field  # type: ignore[prop-decorator]
    @property
    def age(self) -> int | None:
        dob = self.dateOfBirth
        if not dob:
            return None
        today = date.today()
        years = today.year - dob.year
        if (today.month, today.day) < (dob.month, dob.day):
            years -= 1
        return years


class CreateEmployeeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    employeeCode: str | None = Field(default=None, max_length=64)
    dateOfBirth: date | None = None
    gender: Gender | None = None
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    persona: EmployeePersona | None = None
    isDriver: bool = False
    hireDate: date | None = None
    homeAddress: str | None = Field(default=None, max_length=500)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    primaryContact: bool = False
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    zipCode: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=120)
    emergencyContactName: str | None = Field(default=None, max_length=160)
    emergencyContactAddress: str | None = Field(default=None, max_length=500)
    employmentType: str | None = Field(default=None, max_length=80)
    employmentStatus: str | None = Field(default=None, max_length=80)
    experience: str | None = Field(default=None, max_length=120)
    dailyHoursWorked: float | None = Field(default=None, ge=0, le=24)
    companyDriverId: str | None = Field(default=None, max_length=64)
    department: str | None = Field(default=None, max_length=120)
    jobRole: str | None = Field(default=None, max_length=120)
    tenantId: str | None = None


class UpdateEmployeeRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    employeeCode: str | None = Field(default=None, max_length=64)
    dateOfBirth: date | None = None
    gender: Gender | None = None
    status: EmployeeStatus | None = None
    persona: EmployeePersona | None = None
    isDriver: bool | None = None
    hireDate: date | None = None
    homeAddress: str | None = Field(default=None, max_length=500)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    primaryContact: bool | None = None
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    zipCode: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=120)
    emergencyContactName: str | None = Field(default=None, max_length=160)
    emergencyContactAddress: str | None = Field(default=None, max_length=500)
    employmentType: str | None = Field(default=None, max_length=80)
    employmentStatus: str | None = Field(default=None, max_length=80)
    experience: str | None = Field(default=None, max_length=120)
    dailyHoursWorked: float | None = Field(default=None, ge=0, le=24)
    companyDriverId: str | None = Field(default=None, max_length=64)
    department: str | None = Field(default=None, max_length=120)
    jobRole: str | None = Field(default=None, max_length=120)


class ImportEmployeeRowError(BaseModel):
    row: int
    message: str


class ImportEmployeesResponse(BaseModel):
    created: int
    failed: int
    errors: list[ImportEmployeeRowError]
    employees: list[EmployeeResponse]
