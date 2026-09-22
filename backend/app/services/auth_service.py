from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
import time
import uuid
from typing import Any

from ..database import SQLiteSessionRepository
from ..security import check_password_hash, generate_password_hash

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 10


class AuthValidationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class DuplicateEmailError(ValueError):
    pass


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "display_name": user.get("display_name"),
        "created_at": user["created_at"],
    }


class AuthService:
    def __init__(self, repository: SQLiteSessionRepository, session_ttl: int):
        self.repository = repository
        self.session_ttl = session_ttl

    @staticmethod
    def normalize_email(email: Any) -> str:
        if not isinstance(email, str):
            raise AuthValidationError("INVALID_EMAIL", "A valid email is required.")
        normalized = email.strip().lower()
        if len(normalized) > 254 or not EMAIL_PATTERN.fullmatch(normalized):
            raise AuthValidationError("INVALID_EMAIL", "A valid email is required.")
        return normalized

    @staticmethod
    def validate_password(password: Any) -> str:
        if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
            raise AuthValidationError(
                "WEAK_PASSWORD",
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.",
            )
        if len(password) > 128:
            raise AuthValidationError("WEAK_PASSWORD", "Password is too long.")
        return password

    def register(
        self, email: Any, password: Any, display_name: Any = None
    ) -> dict[str, Any]:
        normalized_email = self.normalize_email(email)
        valid_password = self.validate_password(password)
        if display_name is not None:
            if not isinstance(display_name, str) or len(display_name.strip()) > 80:
                raise AuthValidationError(
                    "INVALID_REQUEST", "Display name must be at most 80 characters."
                )
            display_name = display_name.strip() or None
        if self.repository.get_user_by_email(normalized_email) is not None:
            raise DuplicateEmailError("Email is already registered.")
        now = int(time.time())
        user = {
            "user_id": uuid.uuid4().hex,
            "email": normalized_email,
            "password_hash": generate_password_hash(valid_password),
            "display_name": display_name,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        try:
            created = self.repository.create_user(user)
        except sqlite3.IntegrityError as exc:
            # A unique constraint can still race between the pre-check and insert.
            if "UNIQUE constraint failed: users.email" in str(exc):
                raise DuplicateEmailError("Email is already registered.") from exc
            raise
        return public_user(created)

    def authenticate(
        self, email: Any, password: Any
    ) -> tuple[dict[str, Any], str] | None:
        normalized_email = self.normalize_email(email)
        if not isinstance(password, str):
            return None
        user = self.repository.get_user_by_email(normalized_email)
        if user is None or not user.get("is_active"):
            return None
        if not check_password_hash(user["password_hash"], password):
            return None
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        self.repository.create_auth_session(
            {
                "session_id": uuid.uuid4().hex,
                "user_id": user["user_id"],
                "token_hash": hash_session_token(token),
                "expires_at": now + self.session_ttl,
                "created_at": now,
                "last_seen_at": now,
            }
        )
        return public_user(user), token

    def current_user(self, token: str | None) -> dict[str, Any] | None:
        if not token:
            return None
        session = self.repository.get_auth_session(
            hash_session_token(token), int(time.time())
        )
        if session is None:
            return None
        return {
            "user_id": session["user_id"],
            "email": session["email"],
            "display_name": session.get("display_name"),
            "created_at": session["created_at"],
        }

    def logout(self, token: str | None) -> None:
        if token:
            self.repository.delete_auth_session(hash_session_token(token))
        self.repository.delete_expired_auth_sessions(int(time.time()))
