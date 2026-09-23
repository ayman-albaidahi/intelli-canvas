from __future__ import annotations

LEGACY_TEST_USER = "legacy-tests@example.com"


def authenticated_client(app, email="owner@example.com"):
    client = app.test_client()
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct horse battery staple",
            "display_name": "Test Owner",
        },
    )
    assert response.status_code == 201
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 200
    csrf_cookie = client.get_cookie(app.config["CSRF_COOKIE_NAME"])
    assert csrf_cookie is not None
    client.environ_base["HTTP_X_CSRF_TOKEN"] = csrf_cookie.value
    return client


def legacy_owner_id(app) -> str:
    """The user the legacy conftest authenticates every client as.

    The autouse ``authenticate_legacy_clients`` fixture registers this user the
    first time a test client is built, so a session must be linked to it or the
    ownership guard answers every request with 404.
    """
    user = app.config["IMAGE_SESSIONS"].get_user_by_email(LEGACY_TEST_USER)
    assert user is not None, (
        "build a test client first; the legacy conftest registers this user "
        "when app.test_client() is called"
    )
    return user["user_id"]
