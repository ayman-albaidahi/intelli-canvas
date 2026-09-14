from flask import Blueprint, current_app, jsonify, request, send_file

from ..api_utils import error_response
from ..services.file_service import FileStorageService, FileValidationError
from ..services.geometry_service import GeometryService
from ..services.smart_crop_service import SmartCropError, SmartCropService

_DEFAULT_FILE_STORAGE_SERVICE = FileStorageService


def _get_storage_service():
    if FileStorageService is not _DEFAULT_FILE_STORAGE_SERVICE:
        return FileStorageService(**{})
    return current_app.config["FILE_STORAGE_SERVICE"]


transform_bp = Blueprint(
    "transform",
    __name__,
    url_prefix="/api/transform",
)


def _smart_crop_payload():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, error_response("INVALID_REQUEST", "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if current_app.config["IMAGE_SESSION_SERVICE"].get_session(image_id) is None:
        return None, error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return {"image_id": image_id, "aspect_ratio": payload.get("aspect_ratio", "original")}, None


def _smart_crop_service():
    return SmartCropService(
        current_app.config["IMAGE_SESSION_SERVICE"],
        _get_storage_service(),
    )


@transform_bp.post("/smart-crop/preview")
def smart_crop_preview():
    payload, error = _smart_crop_payload()
    if error:
        return error
    try:
        output_path, proposal = _smart_crop_service().preview(
            payload["image_id"], payload["aspect_ratio"]
        )
    except SmartCropError as exc:
        return error_response("INVALID_SMART_CROP", str(exc), 400)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError) as exc:
        return error_response("SMART_CROP_PREVIEW_FAILED", str(exc), 400)
    response = send_file(output_path, mimetype="image/png", max_age=0)
    response.headers["X-Smart-Crop"] = ",".join(
        f"{key}={proposal[key]}" for key in ("x", "y", "width", "height", "score")
    )
    return response


@transform_bp.post("/smart-crop/apply")
def smart_crop_apply():
    payload, error = _smart_crop_payload()
    if error:
        return error
    try:
        result = _smart_crop_service().apply(
            payload["image_id"], payload["aspect_ratio"]
        )
    except SmartCropError as exc:
        return error_response("INVALID_SMART_CROP", str(exc), 400)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError) as exc:
        return error_response("SMART_CROP_FAILED", str(exc), 400)
    return jsonify(success=True, image=result)


@transform_bp.post("/crop")
def crop_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("INVALID_REQUEST", "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    values = [payload.get(name) for name in ("x", "y", "width", "height")]
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if any(isinstance(value, bool) or not isinstance(value, int) for value in values):
        return error_response("INVALID_CROP", "Crop values must be integers.", 400)
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        return error_response("INVALID_CROP", "Crop dimensions are invalid.", 400)

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    try:
        result = GeometryService(session_service, _get_storage_service()).crop(
            image_id, x, y, width, height
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError) as exc:
        return error_response("CROP_FAILED", str(exc), 400)
    return jsonify(success=True, image=result)


@transform_bp.post("/resize")
def resize_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    width = payload.get("width")
    height = payload.get("height")
    lock_aspect_ratio = payload.get("lock_aspect_ratio", True)

    if not isinstance(image_id, str) or not image_id.strip():
        return error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if width is None and height is None:
        return error_response(
            "INVALID_DIMENSIONS", "Width or height is required.", 400
        )
    if width is not None and (
        isinstance(width, bool) or not isinstance(width, int) or width <= 0
    ):
        return error_response(
            "INVALID_DIMENSIONS", "Width must be a positive integer.", 400
        )
    if height is not None and (
        isinstance(height, bool) or not isinstance(height, int) or height <= 0
    ):
        return error_response(
            "INVALID_DIMENSIONS", "Height must be a positive integer.", 400
        )
    if not isinstance(lock_aspect_ratio, bool):
        return error_response(
            "INVALID_ASPECT_RATIO", "lock_aspect_ratio must be a boolean.", 400
        )
    if not lock_aspect_ratio and (width is None or height is None):
        return error_response(
            "INVALID_DIMENSIONS",
            "Width and height are required when aspect ratio is unlocked.",
            400,
        )

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = GeometryService(session_service, _get_storage_service()).resize(
            image_id=image_id,
            width=width,
            height=height,
            lock_aspect_ratio=lock_aspect_ratio,
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            "RESIZE_FAILED", "The image could not be resized.", 400
        )

    return jsonify(success=True, image=result)


@transform_bp.post("/rotate")
def rotate_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    angle = payload.get("angle")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if isinstance(angle, bool) or angle not in {90, -90, 180}:
        return error_response(
            "INVALID_ROTATION", "Angle must be 90, -90, or 180 degrees.", 400
        )

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = GeometryService(session_service, _get_storage_service()).rotate(
            image_id, angle
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            "ROTATE_FAILED", "The image could not be rotated.", 400
        )

    return jsonify(success=True, image=result)


@transform_bp.post("/flip")
def flip_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    direction = payload.get("direction")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if direction not in {"horizontal", "vertical"}:
        return error_response(
            "INVALID_FLIP_DIRECTION",
            "Direction must be horizontal or vertical.",
            400,
        )

    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    if session_service.get_session(image_id) is None:
        return error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = GeometryService(session_service, _get_storage_service()).flip(
            image_id, direction
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            "FLIP_FAILED", "The image could not be flipped.", 400
        )

    return jsonify(success=True, image=result)
