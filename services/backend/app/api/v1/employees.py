from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas import CreateUserResponse
from app.schemas.employee import (
    CreateEmployeeRequest,
    EmployeeResponse,
    ImportEmployeesResponse,
    UpdateEmployeeRequest,
)
from app.services.employee_service import EmployeeService
from app.services.tenant_scope import resolve_effective_tenant

router = APIRouter(prefix="/employees", tags=["employees"])

READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)
WRITE_ROLES = (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN)


@router.get("/import-template")
def download_employee_import_template(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> Response:
    resolve_effective_tenant(current, tenantId)
    data = EmployeeService().build_import_template()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="employee-import-template.xlsx"'
        },
    )


@router.post("/import", response_model=ImportEmployeesResponse)
async def import_employees_from_excel(
    file: UploadFile = File(...),
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> ImportEmployeesResponse:
    raw = await file.read()
    if not raw:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file"
        )
    return EmployeeService().import_from_excel(current, tenantId, raw)


@router.get("", response_model=list[EmployeeResponse])
def list_employees(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> list[EmployeeResponse]:
    return EmployeeService().list_employees(current, tenantId)


@router.post("", response_model=EmployeeResponse, status_code=201)
def create_employee(
    body: CreateEmployeeRequest,
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> EmployeeResponse:
    return EmployeeService().create_employee(current, body)


@router.post("/{employee_id}/create-user", response_model=CreateUserResponse)
def create_user_from_employee(
    employee_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> CreateUserResponse:
    return EmployeeService().create_user_from_employee(current, employee_id, tenantId)


@router.delete("/{employee_id}", response_model=EmployeeResponse)
def delete_employee(
    employee_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> EmployeeResponse:
    return EmployeeService().delete_employee(current, employee_id, tenantId)


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(
    employee_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> EmployeeResponse:
    return EmployeeService().get_employee(current, employee_id, tenantId)


@router.patch("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: str,
    body: UpdateEmployeeRequest,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> EmployeeResponse:
    return EmployeeService().update_employee(current, employee_id, body, tenantId)
