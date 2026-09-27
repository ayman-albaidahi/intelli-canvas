"""A registered user.

The users table is the identity root: every session, project and image
session hangs off it. Promoting the fields the auth flow reads by name
(email for lookup, is_active for the login gate) keeps
``AuthService`` off raw row dicts, where a typo'd column name was only
discoverable at runtime.

``password_hash`` is never part of the public view; ``public_dict`` is the
shape a login or register response may carry, and it structurally cannot
expose the hash.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class User:
    """One registered account."""

    user_id: str
    email: str
    password_hash: str
    display_name: str | None = None
    is_active: bool = True
    created_at: int = 0
    updated_at: int = 0
    payload: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> User:
        return cls(
            user_id=row["user_id"],
            email=row["email"],
            password_hash=row["password_hash"],
            display_name=row.get("display_name"),
            is_active=bool(row.get("is_active", True)),
            created_at=int(row.get("created_at") or 0),
            updated_at=int(row.get("updated_at") or 0),
            payload=dict(row),
        )

    def public_dict(self) -> dict[str, Any]:
        """The client view of this user.

        ``password_hash`` is deliberately absent: a route returning a user
        must never be able to ship the hash, and declaring the allowlist
        once here is what keeps that property as the codebase grows.
        """
        return {
            "user_id": self.user_id,
            "email": self.email,
            "display_name": self.display_name,
            "created_at": self.created_at,
        }
