import sys

from flask import Blueprint, jsonify, request, send_file

from ..dependencies import get_session_service, get_storage_service
from ..error_codes import ErrorCodes
from ..errors import error_response

# Imported for the test monkeypatch seam: tests swap this module-level name to
# inject an isolated storage root, and get_storage_service detects the change.
from ..services.file_service import (  # noqa: F401
    FileStorageService,
    FileValidationError,
)
from ..services.geometry_service import GeometryService
from ..services.smart_crop_service import SmartCropError, SmartCropService
from ..validation import require_choice, require_dict, require_int, require_str
from ..views import public_image

transform_bp = Blueprint(
    "transform",
    __name__,
    url_prefix="/api/transform",
)


def _image_id_from_payload(payload):
    image_id = require_str(
        payload.get("image_id"), name="image_id", empty_code="INVALID_IMAGE_ID"
    )
    if get_session_service().get_session(image_id) is None:
        return None, error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )
    return image_id, None


def _smart_crop_payload():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, error_response(
            ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
        )
    image_id, error = _image_id_from_payload(payload)
    if error:
        return None, error
    return {
        "image_id": image_id,
        "aspect_ratio": payload.get("aspect_ratio", "original"),
    }, None


def _geometry_service() -> GeometryService:
    return GeometryService(
        get_session_service(), get_storage_service(sys.modules[__name__])
    )


@transform_bp.post("/crop")
def crop_image():
    payload = require_dict(request.get_json(silent=True), name="request body")
    image_id, error = _image_id_from_payload(payload)
    if error:
        return error
    x = require_int(payload.get("x"), name="x")
    y = require_int(payload.get("y"), name="y")
    width = require_int(payload.get("width"), low=1, name="width")
    height = require_int(payload.get("height"), low=1, name="height")

    try:
        result = _geometry_service().crop(image_id, x, y, width, height)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.CROP_FAILED, "The image could not be cropped.", 400
        )

    return jsonify(success=True, image=public_image(result))


@transform_bp.post("/resize")
def resize_image():
    payload = require_dict(request.get_json(silent=True), name="request body")
    image_id = require_str(
        payload.get("image_id"), name="image_id", empty_code="INVALID_IMAGE_ID"
    )
    width = payload.get("width")
    height = payload.get("height")
    lock_aspect_ratio = payload.get("lock_aspect_ratio", True)

    if width is None and height is None:
        return error_response(
            ErrorCodes.INVALID_DIMENSIONS, "Width or height is required.", 400
        )
    if width is not None:
        width = require_int(width, low=1, name="width", code="INVALID_DIMENSIONS")
    if height is not None:
        height = require_int(height, low=1, name="height", code="INVALID_DIMENSIONS")
    if not isinstance(lock_aspect_ratio, bool):
        return error_response(
            ErrorCodes.INVALID_ASPECT_RATIO, "lock_aspect_ratio must be a boolean.", 400
        )
    if not lock_aspect_ratio and (width is None or height is None):
        return error_response(
            ErrorCodes.INVALID_DIMENSIONS,
            "Width and height are required when aspect ratio is unlocked.",
            400,
        )

    session_service = get_session_service()
    if session_service.get_session(image_id) is None:
        return error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )

    try:
        result = _geometry_service().resize(
            image_id=image_id,
            width=width,
            height=height,
            lock_aspect_ratio=lock_aspect_ratio,
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.RESIZE_FAILED, "The image could not be resized.", 400
        )

    return jsonify(success=True, image=public_image(result))


@transform_bp.post("/rotate")
def rotate_image():
    payload = require_dict(request.get_json(silent=True), name="request body")
    image_id, error = _image_id_from_payload(payload)
    if error:
        return error
    angle = require_choice(
        payload.get("angle"), (90, -90, 180), name="angle", code="INVALID_ROTATION"
    )

    try:
        result = _geometry_service().rotate(image_id, angle)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.ROTATE_FAILED, "The image could not be rotated.", 400
        )

    return jsonify(success=True, image=public_image(result))


@transform_bp.post("/flip")
def flip_image():
    payload = require_dict(request.get_json(silent=True), name="request body")
    image_id, error = _image_id_from_payload(payload)
    if error:
        return error
    direction = require_choice(
        payload.get("direction"),
        ("horizontal", "vertical"),
        name="direction",
        code="INVALID_FLIP_DIRECTION",
    )

    try:
        result = _geometry_service().flip(image_id, direction)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.FLIP_FAILED, "The image could not be flipped.", 400
        )

    return jsonify(success=True, image=public_image(result))


@transform_bp.post("/smart-crop/preview")
def smart_crop_preview():
    payload, error = _smart_crop_payload()
    if error:
        return error
    try:
        output_path, proposal = SmartCropService(
            get_session_service(), get_storage_service(sys.modules[__name__])
        ).preview(payload["image_id"], payload["aspect_ratio"])
    except SmartCropError as exc:
        return error_response(ErrorCodes.INVALID_SMART_CROP, str(exc), 400)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.SMART_CROP_FAILED,
            "The smart crop preview could not be generated.",
            400,
        )

    response = send_file(str(output_path), mimetype="image/png", max_age=0)
    # Surface the crop geometry so the client can read the proposal without
    # parsing pixels; kept comma-joined for backward compatibility.
    response.headers["X-Smart-Crop"] = ",".join(
        f"{key}={proposal[key]}" for key in ("x", "y", "width", "height")
    )
    return response


@transform_bp.post("/smart-crop/apply")
def smart_crop_apply():
    payload, error = _smart_crop_payload()
    if error:
        return error
    try:
        result = SmartCropService(
            get_session_service(), get_storage_service(sys.modules[__name__])
        ).apply(payload["image_id"], payload["aspect_ratio"])
    except SmartCropError as exc:
        return error_response(ErrorCodes.INVALID_SMART_CROP, str(exc), 400)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.SMART_CROP_FAILED, "The smart crop could not be applied.", 400
        )

    return jsonify(success=True, image=public_image(result))
