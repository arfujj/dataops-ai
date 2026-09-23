from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import TenantContext, get_tenant
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.identity import Membership, User
from app.schemas.auth import CurrentOrganizationResponse, LoginRequest, TokenResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    memberships_query = (
        select(Membership)
        .options(joinedload(Membership.organization))
        .where(Membership.user_id == user.id, Membership.is_active.is_(True))
        .order_by(Membership.created_at.asc())
    )
    memberships = list(db.scalars(memberships_query).unique())
    if payload.organization_slug:
        memberships = [m for m in memberships if m.organization.slug == payload.organization_slug]
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No organization membership"
        )
    if len(memberships) > 1 and payload.organization_slug is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_slug is required for users in multiple organizations",
        )

    membership = memberships[0]
    return TokenResponse(
        access_token=create_access_token(user.id, membership.organization_id),
        role=membership.role,
        user_id=user.id,
        organization=membership.organization,
    )


@router.get("/organizations/current", response_model=CurrentOrganizationResponse)
def current_organization(
    tenant: TenantContext = Depends(get_tenant),
) -> CurrentOrganizationResponse:
    return CurrentOrganizationResponse(
        id=tenant.organization.id,
        name=tenant.organization.name,
        slug=tenant.organization.slug,
        role=tenant.role,
        user_id=tenant.user.id,
        email=tenant.user.email,
        full_name=tenant.user.full_name,
        created_at=tenant.organization.created_at,
    )


@router.get("/organizations/current/members")
def current_members(
    tenant: TenantContext = Depends(get_tenant), db: Session = Depends(get_db)
) -> list[dict[str, str]]:
    rows = db.execute(
        select(User.email, User.full_name, Membership.role)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.organization_id == tenant.organization_id,
            Membership.is_active.is_(True),
        )
        .order_by(User.full_name)
    )
    return [{"email": email, "full_name": name, "role": role} for email, name, role in rows]
