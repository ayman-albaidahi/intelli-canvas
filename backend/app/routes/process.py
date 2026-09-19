from flask import Blueprint, jsonify, request

from ..dependencies import get_session_service, get_storage_service
from ..error_codes import ErrorCodes
from ..errors import error_response
from ..services.file_service import FileValidationError
from ..services.process_service import ProcessService
from ..validation import (
    require_choice,
    require_dict,
    require_int,
    require_number,
    require_odd_int,
)
from ..views import public_image

process_bp = Blueprint("process", __name__, url_prefix="/api/process")


def _image_id_from_payload():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, error_response(ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, error_response(ErrorCodes.INVALID_IMAGE_ID, "A valid image_id is required.", 400)
    if get_session_service().get_session(image_id) is None:
        return None, error_response(ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404)
    return image_id, None


def _process_service() -> ProcessService:
    return ProcessService(
        get_session_service(),
        get_storage_service(),
    )


@process_bp.post("/grayscale")
def convert_to_grayscale():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = _process_service().grayscale(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.GRAYSCALE_FAILED, "The image could not be converted to grayscale.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/brightness")
def adjust_brightness():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_int(payload.get("value", 100), low=0, high=200, name="brightness", code="INVALID_BRIGHTNESS")
    try:
        result = _process_service().brightness(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.BRIGHTNESS_FAILED, "The image brightness could not be adjusted.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/contrast")
def adjust_contrast():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_int(payload.get("value", 100), low=0, high=200, name="contrast", code="INVALID_CONTRAST")
    try:
        result = _process_service().contrast(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.CONTRAST_FAILED, "The image contrast could not be adjusted.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/saturation")
def adjust_saturation():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_int(payload.get("value", 100), low=0, high=200, name="saturation", code="INVALID_SATURATION")
    try:
        result = _process_service().saturation(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.SATURATION_FAILED, "The image saturation could not be adjusted.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/blur")
def blur_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_int(payload.get("value", 0), low=0, high=20, name="blur", code="INVALID_BLUR")
    try:
        result = _process_service().blur(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.BLUR_FAILED, "The image could not be blurred.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/sharpen")
def sharpen_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_int(payload.get("value", 0), low=0, high=5, name="sharpen", code="INVALID_SHARPEN")
    try:
        result = _process_service().sharpen(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.SHARPEN_FAILED, "The image could not be sharpened.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/negative")
def negative_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = _process_service().negative(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.NEGATIVE_FAILED, "The negative could not be produced.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/adjustments")
def apply_adjustments():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = require_dict(request.get_json(silent=True), name="request body")

    values: dict = {}
    for name, low, high in (
        ("brightness", 0, 200),
        ("contrast", 0, 200),
        ("saturation", 0, 200),
        ("blur", 0, 20),
        ("sharpen", 0, 5),
    ):
        value = payload.get(name)
        if value is None:
            continue
        values[name] = require_int(value, low=low, high=high, name=name, code=f"INVALID_{name.upper()}")
    for flag in ("grayscale", "negative"):
        value = payload.get(flag)
        if value is None:
            continue
        if not isinstance(value, bool):
            return error_response(f"INVALID_{flag.upper()}", f"{flag.title()} must be a boolean.", 400)
        values[flag] = value

    neutral = {"brightness": 100, "contrast": 100, "saturation": 100, "blur": 0, "sharpen": 0}
    changed = [key for key, value in values.items() if key in neutral and value != neutral[key]]
    changed += [flag for flag in ("grayscale", "negative") if values.get(flag)]
    if not changed:
        return error_response(ErrorCodes.NO_ADJUSTMENTS, "At least one adjustment must change from its neutral value.", 400)

    try:
        result = _process_service().adjustments(image_id, values)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.ADJUSTMENTS_FAILED, "The adjustments could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/histogram")
def image_histogram():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        histogram = _process_service().histogram(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.HISTOGRAM_FAILED, "The image histogram could not be computed.", 400)
    return jsonify(success=True, histogram=histogram)


@process_bp.post("/sobel")
def sobel_edges():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    ksize = require_odd_int(payload.get("ksize", 3), low=1, high=7, name="Sobel ksize", code="INVALID_SOBEL_KSIZE")
    try:
        result = _process_service().sobel(image_id, ksize)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.SOBEL_FAILED, "Sobel edge detection could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/laplacian")
def laplacian_edges():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = _process_service().laplacian(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.LAPLACIAN_FAILED, "Laplacian edge detection could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/median-filter")
def median_filter():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    ksize = require_odd_int(payload.get("ksize", 3), low=1, high=15, name="Median ksize", code="INVALID_MEDIAN_KSIZE")
    try:
        result = _process_service().median_filter(image_id, ksize)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.MEDIAN_FILTER_FAILED, "The median filter could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/morphology")
def morphology():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    operation = require_choice(payload.get("operation"), ("erode", "dilate", "open", "close"), name="Morphology operation", code="INVALID_MORPHOLOGY_OPERATION")
    ksize = require_odd_int(payload.get("ksize", 3), low=1, high=15, name="Morphology ksize", code="INVALID_MORPHOLOGY_KSIZE")
    try:
        result = _process_service().morphology(image_id, operation, ksize)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.MORPHOLOGY_FAILED, "The morphology operation could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/gamma")
def gamma_correction():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_number(payload.get("value", 1.0), low=0.1, high=5.0, name="gamma", code="INVALID_GAMMA")
    try:
        result = _process_service().gamma(image_id, float(value))
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.GAMMA_FAILED, "Gamma correction could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/threshold")
def threshold_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = require_int(payload.get("value", 128), low=0, high=255, name="threshold", code="INVALID_THRESHOLD")
    try:
        result = _process_service().threshold(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(ErrorCodes.THRESHOLD_FAILED, "The threshold could not be applied.", 400)
    return jsonify(success=True, image=public_image(result))
