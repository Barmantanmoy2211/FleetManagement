from pydantic import BaseModel, Field

from app.models import LocationStatus


class LocationResponse(BaseModel):
    locationId: str
    tenantId: str
    name: str
    code: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    status: LocationStatus
    isPrimary: bool = False
    createdAt: str
    updatedAt: str


class CreateLocationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=32)
    street: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    tenantId: str | None = None


class UpdateLocationRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=32)
    street: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    status: LocationStatus | None = None


class OrgChartNode(BaseModel):
    nodeId: str
    kind: str
    label: str
    role: str | None = None
    locationName: str | None = None
    isSelf: bool = False
    children: list["OrgChartNode"] = Field(default_factory=list)


OrgChartNode.model_rebuild()
