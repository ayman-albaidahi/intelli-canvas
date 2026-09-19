from __future__ import annotations

from flask import jsonify
from werkzeug.exceptions import HTTPException


class AppError(Exception):
    """Base error that can be safely converted into an API response."""

    code = "APP_ERROR"
    status_code = 500
    default_message = "An application error occurred."

    def __init__(self, message: str | None = None, code: str | None = None):
        super().__init__(message or self.default_message)
        self.message = message or self.default_message
        # Allow a specific error code to override the class default, so a
        # single reusable exception can honor field-specific contracts
        # (e.g. INVALID_IMAGE_ID) without a subclass per field.
        if code is not None:
            self.code = code


class InvalidRequestError(AppError):
    code = "INVALID_REQUEST"
    status_code = 400
    default_message = "The request is invalid."


class ImageNotFoundError(AppError):
    code = "IMAGE_SESSION_NOT_FOUND"
    status_code = 404
    default_message = "Image session was not found."


class InvalidImageError(AppError):
    code = "INVALID_FILE"
    status_code = 400
    default_message = "The image is invalid."


class ResourceLimitError(AppError):
    code = "RESOURCE_LIMIT"
    status_code = 413
    default_message = "The operation exceeds the allowed resource limit."


def error_response(code, message: str, status_code: int):
    """Build the standard failure envelope.

    ``code`` may be a plain string (legacy call sites) or an
    :class:`~backend.app.error_codes.ErrorCodes` member; both serialize to the
    same response shape.
    """
    from .error_codes import ErrorCodes

    resolved = code.value if isinstance(code, ErrorCodes) else code
    return jsonify(success=False, error={"code": resolved, "message": message}), status_code


def register_error_handlers(app):
    """Register safe, consistent conversion of application errors to JSON."""

    @app.errorhandler(AppError)
    def handle_app_error(error: AppError):
        return error_response(error.code, error.message, error.status_code)

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        if isinstance(error, HTTPException):
            return error_response(
                error.name.upper().replace(" ", "_"),
                error.description,
                error.code or 500,
            )
        app.logger.exception("Unhandled application error", exc_info=error)
        return error_response(
            "INTERNAL_ERROR",
            "An unexpected server error occurred.",
            500,
        )

    return app
