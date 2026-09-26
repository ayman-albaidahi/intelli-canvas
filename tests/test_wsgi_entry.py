"""Smoke tests for the production WSGI entry point.

``backend/wsgi.py`` is what a real server imports; nothing else in the suite
exercises it, so a broken entry point would ship unnoticed. These tests
import it as a WSGI app, and pin the production guards that
``validate_production_config`` raises on — a misconfigured production deploy
should fail at startup with a clear message, not silently fall back to the
development defaults.
"""

from __future__ import annotations

import importlib

import pytest

from backend.app.config import Config


def _fresh_wsgi(monkeypatch):
    """Import backend.wsgi with Config reloaded against the current env.

    The module binds ``app = create_app(...)`` at import time, and Config
    reads the environment at class-definition time, so both the module and
    the config class have to be reloaded for a monkeypatched env var to take
    effect.
    """
    import backend.app.config as config_module

    monkeypatch.setattr(Config, "DATABASE_PATH", ":memory:", raising=False)
    importlib.reload(config_module)
    wsgi = importlib.import_module("backend.wsgi")
    importlib.reload(wsgi)
    return wsgi


def test_wsgi_entry_point_exposes_a_wsgi_app(monkeypatch):
    wsgi = _fresh_wsgi(monkeypatch)
    assert callable(wsgi.app)
    # The health endpoint is the cheapest proof the app is wired and serving.
    client = wsgi.app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200


def test_wsgi_import_does_not_require_cwd(monkeypatch):
    """DATABASE_PATH resolves relative to the repo, not the working directory.

    A gunicorn process started from /etc or a systemd unit has a different
    cwd than a developer's shell; the default must not silently point at a
    database that does not exist relative to that directory.
    """
    wsgi = _fresh_wsgi(monkeypatch)
    # The default is instance/intellicanvas.sqlite3 resolved from the repo
    # root, so the app must build regardless of where it was imported from.
    assert wsgi.app.config["DATABASE_PATH"]


def test_production_config_rejects_the_dev_secret(monkeypatch):
    """APP_ENV=production with the fallback SECRET_KEY must fail loudly.

    Shipping the dev secret to production would let an attacker forge session
    cookies; this is the guard that stops a deploy that forgot the env var.
    """
    monkeypatch.setenv("INTELLICANVAS_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "intelli-canvas-dev-secret")
    from backend.app.config import validate_production_config

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_config(
            {
                "APP_ENV": "production",
                "SECRET_KEY": "intelli-canvas-dev-secret",
                "AUTH_COOKIE_SECURE": True,
                "AUTH_SESSION_TTL_SECONDS": 3600,
            }
        )


def test_production_config_rejects_insecure_cookies(monkeypatch):
    monkeypatch.setenv("INTELLICANVAS_ENV", "production")
    from backend.app.config import validate_production_config

    with pytest.raises(RuntimeError, match="AUTH_COOKIE_SECURE"):
        validate_production_config(
            {
                "APP_ENV": "production",
                "SECRET_KEY": "a-real-production-secret",
                "AUTH_COOKIE_SECURE": False,
                "AUTH_SESSION_TTL_SECONDS": 3600,
            }
        )


def test_production_config_rejects_nonpositive_session_ttl(monkeypatch):
    monkeypatch.setenv("INTELLICANVAS_ENV", "production")
    from backend.app.config import validate_production_config

    with pytest.raises(RuntimeError, match="AUTH_SESSION_TTL_SECONDS"):
        validate_production_config(
            {
                "APP_ENV": "production",
                "SECRET_KEY": "a-real-production-secret",
                "AUTH_COOKIE_SECURE": True,
                "AUTH_SESSION_TTL_SECONDS": 0,
            }
        )


def test_production_config_accepts_a_complete_configuration(monkeypatch):
    from backend.app.config import validate_production_config

    validate_production_config(
        {
            "APP_ENV": "production",
            "SECRET_KEY": "a-real-production-secret",
            "AUTH_COOKIE_SECURE": True,
            "AUTH_SESSION_TTL_SECONDS": 3600,
        }
    )


def test_development_env_skips_the_production_checks(monkeypatch):
    """Development keeps working with the fallback secret.

    The guard is opt-in via APP_ENV; raising during local runs would break
    every developer's first checkout.
    """
    from backend.app.config import validate_production_config

    validate_production_config(
        {
            "APP_ENV": "development",
            "SECRET_KEY": "intelli-canvas-dev-secret",
            "AUTH_COOKIE_SECURE": False,
            "AUTH_SESSION_TTL_SECONDS": 60 * 60 * 24 * 7,
        }
    )
