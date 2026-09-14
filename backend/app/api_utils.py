from flask import jsonify
from werkzeug.exceptions import HTTPException

from .errors import AppError


def error_response(code: str, message: str, status_code: int):
    return jsonify(success=False, error={"code": code, "message": message}), status_code


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
