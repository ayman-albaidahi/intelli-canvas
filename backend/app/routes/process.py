from flask import Blueprint, current_app, jsonify, request

from ..services.file_service import FileStorageService, FileValidationError
from ..services.process_service import ProcessService

process_bp = Blueprint("process", __name__, url_prefix="/api/process")


def _error_response(code: str, message: str, status_code: int):
    return jsonify(success=False, error={"code": code, "message": message}), status_code


def _image_id_from_payload():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, _error_response("INVALID_REQUEST", "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, _error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if current_app.config["IMAGE_SESSION_SERVICE"].get_session(image_id) is None:
        return None, _error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return image_id, None


@process_bp.post("/grayscale")
def convert_to_grayscale():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], FileStorageService()).grayscale(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response("GRAYSCALE_FAILED", "The image could not be converted to grayscale.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key not in {"path"}})


@process_bp.post("/brightness")
def adjust_brightness():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 100)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 200:
        return _error_response("INVALID_BRIGHTNESS", "Brightness value must be an integer from 0 to 200.", 400)
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], FileStorageService()).brightness(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response("BRIGHTNESS_FAILED", "The image brightness could not be adjusted.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/contrast")
def adjust_contrast():
    return _error_response("NOT_IMPLEMENTED", "Contrast processing is not implemented yet.", 501)


@process_bp.post("/blur")
def blur_image():
    return _error_response("NOT_IMPLEMENTED", "Blur processing is not implemented yet.", 501)


@process_bp.post("/sharpen")
def sharpen_image():
    return _error_response("NOT_IMPLEMENTED", "Sharpen processing is not implemented yet.", 501)
