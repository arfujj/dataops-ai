from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    organization_slug: str | None = Field(default=None, min_length=1, max_length=80)


class OrganizationSummary(BaseModel):
    id: UUID
    name: str
    slug: str

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: UUID
    organization: OrganizationSummary


class CurrentOrganizationResponse(OrganizationSummary):
    role: str
    user_id: UUID
    email: EmailStr
    full_name: str
    created_at: datetime
