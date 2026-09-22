from __future__ import annotations

from functools import wraps
from typing import Any, Callable

from flask import current_app, g, request

from .error_codes import ErrorCodes
from .errors import error_response
from .services.auth_service import AuthService


def get_auth_service() -> AuthService:
    return current_app.config["AUTH_SERVICE"]


def current_user() -> dict[str, Any] | None:
    if "current_user" not in g:
        g.current_user = get_auth_service().current_user(
            request.cookies.get(current_app.config["AUTH_COOKIE_NAME"])
        )
    return g.current_user


def require_current_user(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return error_response(
                ErrorCodes.AUTH_REQUIRED,
                "Authentication is required.",
                401,
            )
        return view(*args, **kwargs)

    return wrapped


def set_auth_cookie(response, token: str):
    response.set_cookie(
        current_app.config["AUTH_COOKIE_NAME"],
        token,
        max_age=current_app.config["AUTH_SESSION_TTL_SECONDS"],
        httponly=True,
        secure=current_app.config["AUTH_COOKIE_SECURE"],
        samesite=current_app.config["AUTH_COOKIE_SAMESITE"],
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


def clear_auth_cookie(response):
    response.delete_cookie(
        current_app.config["AUTH_COOKIE_NAME"],
        secure=current_app.config["AUTH_COOKIE_SECURE"],
        httponly=True,
        samesite=current_app.config["AUTH_COOKIE_SAMESITE"],
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return response
