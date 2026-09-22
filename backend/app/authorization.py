from __future__ import annotations

from functools import wraps
from typing import Any, Callable

from flask import g, request

from .auth import current_user
from .dependencies import get_session_repository
from .error_codes import ErrorCodes
from .errors import error_response


def _resource_not_found():
    return error_response(
        ErrorCodes.RESOURCE_NOT_FOUND,
        "The requested resource was not found.",
        404,
    )


def _request_payload() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def request_image_id(view_args: dict[str, Any] | None = None) -> str | None:
    """Resolve image_id from path, query, form, or JSON in that order."""
    view_args = view_args or {}
    image_id = view_args.get("image_id")
    if image_id is None:
        image_id = request.args.get("image_id")
    if image_id is None:
        image_id = request.form.get("image_id")
    if image_id is None:
        image_id = _request_payload().get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None
    return image_id


def _require_image_id(view_args: dict[str, Any]) -> tuple[str | None, Any | None]:
    image_id = request_image_id(view_args)
    if image_id is None:
        return None, error_response(
            ErrorCodes.INVALID_IMAGE_ID,
            "A valid image_id is required.",
            400,
        )
    return image_id, None


def require_owned_image(view: Callable):
    """Require an authenticated user who owns the referenced image session."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error_response(
                ErrorCodes.AUTH_REQUIRED,
                "Authentication is required.",
                401,
            )
        image_id, error = _require_image_id(kwargs)
        if error:
            return error
        repository = get_session_repository()
        if repository.get_session(image_id) is None:
            return error_response(
                ErrorCodes.IMAGE_SESSION_NOT_FOUND,
                "Image session was not found.",
                404,
            )
        session = repository.get_session_for_owner(image_id, user["user_id"])
        if session is None:
            return _resource_not_found()
        g.authorized_image_id = image_id
        g.authorized_image_session = session
        g.authorized_owner_id = user["user_id"]
        return view(*args, **kwargs)

    return wrapped


def require_owned_asset(view: Callable):
    """Require an authenticated user who owns an image asset."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error_response(
                ErrorCodes.AUTH_REQUIRED,
                "Authentication is required.",
                401,
            )
        image_id, error = _require_image_id(kwargs)
        if error:
            return error
        asset_id = kwargs.get("asset_id")
        if not isinstance(asset_id, str) or not asset_id.strip():
            return _resource_not_found()
        repository = get_session_repository()
        if repository.get_session(image_id) is None:
            return error_response(
                ErrorCodes.IMAGE_SESSION_NOT_FOUND,
                "Image session was not found.",
                404,
            )
        session = repository.get_session_for_owner(image_id, user["user_id"])
        asset = repository.get_asset_for_owner(
            asset_id, image_id, user["user_id"]
        )
        if session is None or asset is None:
            return _resource_not_found()
        g.authorized_image_id = image_id
        g.authorized_image_session = session
        g.authorized_asset = asset
        g.authorized_owner_id = user["user_id"]
        return view(*args, **kwargs)

    return wrapped
