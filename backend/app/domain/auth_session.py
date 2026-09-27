"""An authenticated session for a user.

An ``auth_sessions`` row is a bearer of identity: the token hash is what a
cookie carries, and the joined user columns are what ``current_user``
returns. This type holds both, because the repository resolves them in a
single JOIN — splitting them into two lookups would mean two queries per
request and a race between the session expiring and the user being read.

``token`` itself never reaches this type; only its SHA-256 hash is stored
and compared, so a session object leaking into a response cannot disclose
the bearer credential.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class AuthSession:
    """One validated session, with the user it authenticates."""

    session_id: str
    user_id: str
    expires_at: int
    created_at: int
    last_seen_at: int
    email: str = ""
    display_name: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> AuthSession:
        return cls(
            session_id=row["session_id"],
            user_id=row["user_id"],
            expires_at=int(row.get("expires_at") or 0),
            created_at=int(row.get("created_at") or 0),
            last_seen_at=int(row.get("last_seen_at") or 0),
            email=row.get("email") or "",
            display_name=row.get("display_name"),
            payload=dict(row),
        )

    def is_active(self, now: int) -> bool:
        """Whether this session is still valid at ``now``."""
        return self.expires_at > now

    def public_user_dict(self) -> dict[str, Any]:
        """The identity ``current_user`` exposes for this session.

        Mirrors ``User.public_dict``: the session is the request-time view of
        a user, so the two must agree on what a client may see.
        """
        return {
            "user_id": self.user_id,
            "email": self.email,
            "display_name": self.display_name,
            "created_at": self.created_at,
        }
