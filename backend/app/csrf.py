from __future__ import annotations

import secrets

from flask import current_app, request

from .errors import error_response

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _cookie_name() -> str:
    return current_app.config["CSRF_COOKIE_NAME"]


def _header_name() -> str:
    return current_app.config["CSRF_HEADER_NAME"]


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response):
    if request.cookies.get(_cookie_name()):
        return response
    response.set_cookie(
        _cookie_name(),
        generate_csrf_token(),
        max_age=current_app.config["AUTH_SESSION_TTL_SECONDS"],
        httponly=False,
        secure=current_app.config["AUTH_COOKIE_SECURE"],
        samesite=current_app.config["AUTH_COOKIE_SAMESITE"],
        path="/",
    )
    return response


def csrf_failure():
    return error_response(
        "CSRF_TOKEN_INVALID",
        "A valid CSRF token is required for this request.",
        403,
    )


def validate_csrf_request() -> bool:
    if request.method in SAFE_METHODS:
        return True
    cookie_token = request.cookies.get(_cookie_name())
    header_token = request.headers.get(_header_name())
    return bool(
        cookie_token
        and header_token
        and secrets.compare_digest(cookie_token, header_token)
    )


def exempt_csrf_endpoint() -> bool:
    return request.endpoint in {"auth.register", "auth.login"}


def enforce_csrf():
    if request.method in SAFE_METHODS or exempt_csrf_endpoint():
        return None
    # Let centralized route authorization return AUTH_REQUIRED for anonymous
    # callers instead of masking it with a CSRF error.
    if not request.cookies.get(current_app.config["AUTH_COOKIE_NAME"]):
        return None
    if not validate_csrf_request():
        return csrf_failure()
    return None


def csrf_protection_enabled() -> bool:
    return bool(current_app.config.get("CSRF_ENABLED", True))


def enforce_enabled_csrf():
    if not csrf_protection_enabled():
        return None
    return enforce_csrf()


__all__ = [
    "SAFE_METHODS",
    "enforce_enabled_csrf",
    "generate_csrf_token",
    "set_csrf_cookie",
]
