from __future__ import annotations

from typing import Any, Protocol

from backend.app.domain.user import User


class UserRepository(Protocol):
    """The persistence seam for the users table.

    Split out of the old monolithic AuthStore so the user concern can be
    satisfied by a stand-in that implements only it. AuthService reads users
    for registration, login and the is_active gate; it never needs the
    session or image surface that AuthStore also advertised.
    """

    def create_user(self, user: dict[str, Any]) -> User: ...

    def get_user(self, user_id: str) -> User | None: ...

    def get_user_by_email(self, email: str) -> User | None: ...
