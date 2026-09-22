from __future__ import annotations

from auth_helpers import authenticated_client

from backend.app import create_app
from backend.app.config import validate_production_config


def _register_and_login(app, email="csrf@example.com"):
    client = app.test_client()
    payload = {
        "email": email,
        "password": "correct horse battery staple",
        "display_name": "CSRF Test",
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/auth/login",
            json={"email": email, "password": payload["password"]},
        ).status_code
        == 200
    )
    client.environ_base.pop("HTTP_X_CSRF_TOKEN", None)
    return client


def _csrf(client):
    cookie = client.get_cookie("ic_csrf")
    assert cookie is not None
    return cookie.value


def test_mutating_request_requires_matching_csrf_cookie_and_header():
    app = create_app(":memory:")
    client = _register_and_login(app)

    missing = client.post("/api/auth/logout")
    assert missing.status_code == 403
    assert missing.get_json()["error"]["code"] == "CSRF_TOKEN_INVALID"

    wrong = client.post("/api/auth/logout", headers={"X-CSRF-Token": "wrong-token"})
    assert wrong.status_code == 403

    valid = client.post("/api/auth/logout", headers={"X-CSRF-Token": _csrf(client)})
    assert valid.status_code == 200


def test_csrf_cannot_be_bypassed_by_method_or_payload_shape():
    app = create_app(":memory:")
    client = _register_and_login(app, "method-bypass@example.com")

    for method in ("post", "put", "patch", "delete"):
        response = getattr(client, method)(
            "/api/auth/logout", json={"_csrf": "wrong-token"}
        )
        assert response.status_code == 403
        assert response.get_json()["error"]["code"] == "CSRF_TOKEN_INVALID"


def test_register_and_login_remain_available_without_a_csrf_header():
    app = create_app(":memory:")
    client = app.test_client()
    payload = {
        "email": "bootstrap@example.com",
        "password": "correct horse battery staple",
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/login", json=payload).status_code == 200


def test_login_rate_limit_returns_429_without_revealing_credentials():
    app = create_app(":memory:")
    app.config["RATE_LIMIT_RULES"]["login"] = {"limit": 1, "window_seconds": 60}
    client = app.test_client()
    payload = {"email": "missing@example.com", "password": "wrong password"}

    first = client.post("/api/auth/login", json=payload)
    second = client.post("/api/auth/login", json=payload)

    assert first.status_code == 401
    assert second.status_code == 429
    assert second.get_json()["error"]["code"] == "RATE_LIMITED"
    assert "Retry-After" in second.headers


def test_expensive_operations_share_a_rate_limit_rule():
    app = create_app(":memory:")
    app.config["RATE_LIMIT_RULES"]["expensive"] = {"limit": 1, "window_seconds": 60}
    client = authenticated_client(app, "expensive@example.com")
    payload = {"image_id": "missing-image"}

    first = client.post("/api/analysis", json=payload)
    second = client.post("/api/analysis", json=payload)

    assert first.status_code != 429
    assert second.status_code == 429
    assert second.get_json()["error"]["code"] == "RATE_LIMITED"


def test_production_configuration_rejects_insecure_defaults():
    base = {
        "APP_ENV": "production",
        "SECRET_KEY": "intelli-canvas-dev-secret",
        "AUTH_COOKIE_SECURE": False,
        "AUTH_SESSION_TTL_SECONDS": 3600,
    }
    try:
        validate_production_config(base)
    except RuntimeError as exc:
        assert "SECRET_KEY" in str(exc)
    else:
        raise AssertionError("default production secret must be rejected")

    valid = {
        **base,
        "SECRET_KEY": "a-long-production-secret-value",
        "AUTH_COOKIE_SECURE": True,
    }
    validate_production_config(valid)
