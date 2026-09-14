from __future__ import annotations


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
