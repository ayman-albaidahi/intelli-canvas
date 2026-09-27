from __future__ import annotations

from typing import Any, Protocol

from backend.app.domain.auth_session import AuthSession


class AuthSessionRepository(Protocol):
    """The persistence seam for the auth_sessions table.

    Split out of the old monolithic AuthStore. The session concern is
    independent of user storage: a deployment could move sessions to Redis
    (fast TTL expiry, shared across workers) while users stay in the
    relational database, and only this seam would change.
    """

    def create_auth_session(self, session: dict[str, Any]) -> None: ...

    def get_auth_session(self, token_hash: str, now: int) -> AuthSession | None: ...

    def delete_auth_session(self, token_hash: str) -> None: ...

    def delete_expired_auth_sessions(self, now: int) -> int: ...
