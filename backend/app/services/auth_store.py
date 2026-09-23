from __future__ import annotations

from typing import Any, Protocol


class AuthStore(Protocol):
    """The persistence seam an AuthService is wired against.

    Declares the methods the service actually calls. The service was typed
    against SQLiteSessionRepository directly, which couples it to the whole
    700-line session/project/asset surface even though it only touches the
    users and auth_sessions tables. Naming the narrow interface here is what
    lets the auth concern be satisfied by a stand-in that implements only it.
    """

    def create_user(self, user: dict[str, Any]) -> dict[str, Any]: ...

    def get_user(self, user_id: str) -> dict[str, Any] | None: ...

    def get_user_by_email(self, email: str) -> dict[str, Any] | None: ...

    def create_auth_session(self, session: dict[str, Any]) -> None: ...

    def get_auth_session(self, token_hash: str, now: int) -> dict[str, Any] | None: ...

    def delete_auth_session(self, token_hash: str) -> None: ...

    def delete_expired_auth_sessions(self, now: int) -> int: ...
