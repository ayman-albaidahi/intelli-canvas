"""Guards the User and AuthSession domain models.

The property these tests pin is structural: ``password_hash`` must never
appear in a response, and the session must be the request-time view of the
user it authenticates. A future field added to either dataclass cannot
silently widen what a client sees, because the public view is an allowlist
declared once.
"""

import dataclasses

from backend.app.domain.auth_session import AuthSession
from backend.app.domain.user import User


def _user() -> User:
    return User(
        user_id="u1",
        email="owner@example.com",
        password_hash="argon2$hashed",
        display_name="Owner",
        is_active=True,
        created_at=1_700_000_000,
        updated_at=1_700_000_500,
    )


def _session() -> AuthSession:
    return AuthSession(
        session_id="s1",
        user_id="u1",
        expires_at=1_000,
        created_at=1_700_000_000,
        last_seen_at=900,
        email="owner@example.com",
        display_name="Owner",
    )


def test_user_public_dict_omits_the_password_hash():
    public = _user().public_dict()
    assert "password_hash" not in public
    assert "password" not in public


def test_user_public_dict_exposes_the_client_contract():
    assert _user().public_dict() == {
        "user_id": "u1",
        "email": "owner@example.com",
        "display_name": "Owner",
        "created_at": 1_700_000_000,
    }


def test_user_keeps_the_fields_services_read_by_name():
    # The login gate reads is_active and the hash is verified here, so both
    # stay on the object even though neither is in the public view.
    user = _user()
    assert user.password_hash == "argon2$hashed"
    assert user.is_active is True


def test_user_from_row_coerces_the_active_flag_and_timestamps():
    user = User.from_row(
        {
            "user_id": "u1",
            "email": "owner@example.com",
            "password_hash": "hashed",
            "display_name": None,
            "is_active": 0,
            "created_at": "5",
            "updated_at": None,
        }
    )
    assert user.is_active is False
    assert user.display_name is None
    assert user.created_at == 5
    assert user.updated_at == 0


def test_user_is_immutable():
    try:
        _user().email = "other@example.com"
    except dataclasses.FrozenInstanceError:
        return
    raise AssertionError("User should be frozen")


def test_session_public_user_dict_matches_the_user_contract():
    # current_user() returns this shape and a register response returns
    # User.public_dict(); the two views of one identity must agree.
    assert _session().public_user_dict() == _user().public_dict()


def test_session_carries_no_bearer_credential():
    # The raw token never reaches this type, and its hash is compared by the
    # repository rather than carried on the object a route might return.
    fields = {f.name for f in dataclasses.fields(AuthSession)}
    assert "token" not in fields
    assert "token_hash" not in fields


def test_session_expiry_is_answered_by_the_object():
    session = _session()
    assert session.is_active(999) is True
    assert session.is_active(1_000) is False
    assert session.is_active(1_001) is False


def test_session_is_immutable():
    try:
        _session().user_id = "other"
    except dataclasses.FrozenInstanceError:
        return
    raise AssertionError("AuthSession should be frozen")
