import pytest
from flask import Flask

from backend.app.config import Config


@pytest.fixture(autouse=True)
def use_in_memory_database(monkeypatch):
    monkeypatch.setattr(Config, "DATABASE_PATH", ":memory:")


@pytest.fixture(autouse=True)
def authenticate_legacy_clients(request, monkeypatch):
    """Keep pre-authentication endpoint tests focused on their old behavior.

    The ownership and auth suites intentionally exercise anonymous clients and
    therefore opt out. Other legacy endpoint tests create ``app.test_client``
    directly; authenticate those clients at the fixture boundary rather than
    weakening production authorization or editing every historical test.
    """
    if str(request.path).endswith(("test_auth.py", "test_ownership.py")):
        return

    original_test_client = Flask.test_client

    def authenticated_test_client(app, *args, **kwargs):
        client = original_test_client(app, *args, **kwargs)
        payload = {
            "email": "legacy-tests@example.com",
            "password": "correct horse battery staple",
            "display_name": "Legacy Tests",
        }
        registration = client.post("/api/auth/register", json=payload)
        assert registration.status_code in (201, 409)
        login = client.post(
            "/api/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        )
        assert login.status_code == 200
        return client

    monkeypatch.setattr(Flask, "test_client", authenticated_test_client)
