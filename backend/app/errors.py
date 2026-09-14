from __future__ import annotations

from flask import jsonify
from werkzeug.exceptions import HTTPException


class AppError(Exception):
    """Base error that can be safely converted into an API response."""

    code = "APP_ERROR"
    status_code = 500
    default_message = "An application error occurred."

    def __init__(self, message: str | None = None):
        super().__init__(message or self.default_message)
        self.message = message or self.default_message


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


def error_response(code: str, message: str, status_code: int):
    return jsonify(success=False, error={"code": code, "message": message}), status_code


def not_implemented_response(feature_name: str):
    return error_response(
        "NOT_IMPLEMENTED",
        f"{feature_name} management is not implemented yet.",
        501,
    )


def register_error_handlers(app):
    """Register safe, consistent conversion of application errors to JSON."""

    @app.errorhandler(AppError)
    def handle_app_error(error: AppError):
        return error_response(error.code, error.message, error.status_code)

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        if isinstance(error, HTTPException):
            return error
        app.logger.exception("Unhandled application error", exc_info=error)
        return error_response(
            "INTERNAL_ERROR",
            "An unexpected server error occurred.",
            500,
        )

    return app
