from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from passlib.context import CryptContext

from app.core.config import settings

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_context.verify(password, password_hash)


def create_access_token(user_id: UUID, organization_id: UUID) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "org": str(organization_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    return UUID(payload["sub"]), UUID(payload["org"])
