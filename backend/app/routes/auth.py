from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from ..auth import clear_auth_cookie, current_user, get_auth_service, set_auth_cookie
from ..error_codes import ErrorCodes
from ..errors import error_response
from ..services.auth_service import AuthValidationError, DuplicateEmailError

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _payload():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else None


def _no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@auth_bp.post("/register")
def register():
    payload = _payload()
    if payload is None:
        return error_response(
            ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
        )
    try:
        user = get_auth_service().register(
            payload.get("email"), payload.get("password"), payload.get("display_name")
        )
    except AuthValidationError as exc:
        return error_response(exc.code, exc.message, 400)
    except DuplicateEmailError:
        return error_response(
            ErrorCodes.EMAIL_ALREADY_REGISTERED,
            "Email is already registered.",
            409,
        )
    return _no_store(jsonify(success=True, user=user)), 201


@auth_bp.post("/login")
def login():
    payload = _payload()
    if payload is None:
        return error_response(
            ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
        )
    try:
        result = get_auth_service().authenticate(
            payload.get("email"), payload.get("password")
        )
    except AuthValidationError:
        result = None
    if result is None:
        return error_response(
            ErrorCodes.INVALID_CREDENTIALS,
            "Email or password is incorrect.",
            401,
        )
    user, token = result
    return set_auth_cookie(jsonify(success=True, user=user), token)


@auth_bp.post("/logout")
def logout():
    token = request.cookies.get(current_app.config["AUTH_COOKIE_NAME"])
    get_auth_service().logout(token)
    return clear_auth_cookie(jsonify(success=True))


@auth_bp.get("/me")
def me():
    user = current_user()
    response = jsonify(success=True, authenticated=user is not None, user=user)
    return _no_store(response)
