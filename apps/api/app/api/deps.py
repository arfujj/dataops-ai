from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.identity import Membership, Organization, User

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    user: User
    organization: Organization
    role: str

    @property
    def organization_id(self) -> UUID:
        return self.organization.id


def get_tenant(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> TenantContext:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        user_id, organization_id = decode_access_token(credentials.credentials)
    except (jwt.PyJWTError, ValueError, KeyError):
        raise unauthorized from None

    membership = db.scalar(
        select(Membership)
        .options(joinedload(Membership.user), joinedload(Membership.organization))
        .where(
            Membership.user_id == user_id,
            Membership.organization_id == organization_id,
            Membership.is_active.is_(True),
        )
    )
    if membership is None or not membership.user.is_active:
        raise unauthorized
    return TenantContext(membership.user, membership.organization, membership.role)


def require_roles(*roles: str):
    def dependency(tenant: TenantContext = Depends(get_tenant)) -> TenantContext:
        if tenant.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return tenant

    return dependency
