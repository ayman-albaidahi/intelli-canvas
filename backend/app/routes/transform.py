from flask import Blueprint, current_app, jsonify, request

from ..services.file_service import FileStorageService, FileValidationError
from ..services.geometry_service import GeometryService

transform_bp = Blueprint(
    "transform",
    __name__,
    url_prefix="/api/transform",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "This image transformation is not implemented yet.",
            },
        ),
        501,
    )


def _error_response(code: str, message: str, status_code: int):
    return (
        jsonify(success=False, error={"code": code, "message": message}),
        status_code,
    )


@transform_bp.post("/crop")
def crop_image():
    return _not_implemented_response()


@transform_bp.post("/resize")
def resize_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    width = payload.get("width")
    height = payload.get("height")
    lock_aspect_ratio = payload.get("lock_aspect_ratio", True)

    if not isinstance(image_id, str) or not image_id.strip():
        return _error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if width is None and height is None:
        return _error_response(
            "INVALID_DIMENSIONS", "Width or height is required.", 400
        )
    if width is not None and (
        isinstance(width, bool) or not isinstance(width, int) or width <= 0
    ):
        return _error_response(
            "INVALID_DIMENSIONS", "Width must be a positive integer.", 400
        )
    if height is not None and (
        isinstance(height, bool) or not isinstance(height, int) or height <= 0
    ):
        return _error_response(
            "INVALID_DIMENSIONS", "Height must be a positive integer.", 400
        )
    if not isinstance(lock_aspect_ratio, bool):
        return _error_response(
            "INVALID_ASPECT_RATIO", "lock_aspect_ratio must be a boolean.", 400
        )
    if not lock_aspect_ratio and (width is None or height is None):
        return _error_response(
            "INVALID_DIMENSIONS",
            "Width and height are required when aspect ratio is unlocked.",
            400,
        )

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return _error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = GeometryService(session_service, FileStorageService()).resize(
            image_id=image_id,
            width=width,
            height=height,
            lock_aspect_ratio=lock_aspect_ratio,
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response(
            "RESIZE_FAILED", "The image could not be resized.", 400
        )

    return jsonify(success=True, image=result)


@transform_bp.post("/rotate")
def rotate_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    angle = payload.get("angle")
    if not isinstance(image_id, str) or not image_id.strip():
        return _error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if isinstance(angle, bool) or angle not in {90, -90, 180}:
        return _error_response(
            "INVALID_ROTATION", "Angle must be 90, -90, or 180 degrees.", 400
        )

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return _error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = GeometryService(session_service, FileStorageService()).rotate(
            image_id, angle
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response(
            "ROTATE_FAILED", "The image could not be rotated.", 400
        )

    return jsonify(success=True, image=result)


@transform_bp.post("/flip")
def flip_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    direction = payload.get("direction")
    if not isinstance(image_id, str) or not image_id.strip():
        return _error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if direction not in {"horizontal", "vertical"}:
        return _error_response(
            "INVALID_FLIP_DIRECTION",
            "Direction must be horizontal or vertical.",
            400,
        )

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return _error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = GeometryService(session_service, FileStorageService()).flip(
            image_id, direction
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response(
            "FLIP_FAILED", "The image could not be flipped.", 400
        )

    return jsonify(success=True, image=result)
