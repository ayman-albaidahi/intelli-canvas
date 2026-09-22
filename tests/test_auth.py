import time

from backend.app import create_app
from backend.app.services.auth_service import hash_session_token


def _app():
    return create_app(":memory:")


def _register(
    client, email="user@example.com", password="correct horse battery staple"
):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "Test User"},
    )


def test_me_is_anonymous_without_a_cookie():
    response = _app().test_client().get("/api/auth/me")

    assert response.status_code == 200
    assert response.get_json() == {
        "success": True,
        "authenticated": False,
        "user": None,
    }
    assert response.headers["Cache-Control"] == "no-store"


def test_register_normalizes_email_and_never_returns_password_data():
    app = _app()
    client = app.test_client()

    response = _register(client, " User@Example.COM ")

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["user"]["email"] == "user@example.com"
    assert "password" not in payload["user"]
    assert "password_hash" not in payload["user"]
    stored = app.config["IMAGE_SESSIONS"].get_user_by_email("user@example.com")
    assert stored is not None
    assert stored["password_hash"] != "correct horse battery staple"


def test_duplicate_email_and_invalid_registration_are_rejected():
    client = _app().test_client()
    assert _register(client).status_code == 201

    duplicate = _register(client)
    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"

    weak = client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "short"},
    )
    assert weak.status_code == 400
    assert weak.get_json()["error"]["code"] == "WEAK_PASSWORD"


def test_login_sets_http_only_cookie_without_exposing_raw_token():
    client = _app().test_client()
    _register(client)

    response = client.post(
        "/api/auth/login",
        json={"email": "USER@example.com", "password": "correct horse battery staple"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert "token" not in payload
    assert "password" not in payload["user"]
    cookie = response.headers["Set-Cookie"]
    assert "ic_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert "password" not in cookie.lower()

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["authenticated"] is True
    assert me.get_json()["user"]["email"] == "user@example.com"


def test_invalid_login_does_not_reveal_which_credential_failed():
    client = _app().test_client()
    _register(client)

    wrong_password = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "wrong password"},
    )
    unknown_email = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "wrong password"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.get_json() == unknown_email.get_json()


def test_logout_revokes_session_and_clears_cookie():
    client = _app().test_client()
    _register(client)
    login = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "correct horse battery staple"},
    )
    assert login.status_code == 200

    csrf_cookie = client.get_cookie("ic_csrf")
    assert csrf_cookie is not None
    logout = client.post(
        "/api/auth/logout", headers={"X-CSRF-Token": csrf_cookie.value}
    )
    assert logout.status_code == 200
    assert "Max-Age=0" in logout.headers["Set-Cookie"]
    assert client.get("/api/auth/me").get_json()["authenticated"] is False


def test_expired_and_unknown_session_tokens_are_rejected():
    app = _app()
    client = app.test_client()
    _register(client)
    user = app.config["IMAGE_SESSIONS"].get_user_by_email("user@example.com")
    now = int(time.time())
    app.config["IMAGE_SESSIONS"].create_auth_session(
        {
            "session_id": "expired-session",
            "user_id": user["user_id"],
            "token_hash": hash_session_token("expired-token"),
            "expires_at": now - 1,
            "created_at": now - 10,
            "last_seen_at": now - 10,
        }
    )

    with client:
        client.set_cookie("ic_session", "expired-token")
        response = client.get("/api/auth/me")
    assert response.get_json()["authenticated"] is False
    assert (
        app.config["IMAGE_SESSIONS"].get_auth_session(
            hash_session_token("expired-token"), now
        )
        is None
    )
