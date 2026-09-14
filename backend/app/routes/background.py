import io

from flask import Blueprint, current_app, jsonify, request, send_file

from ..services.background_service import BackgroundParamError, BackgroundService
from ..services.file_service import FileStorageService, FileValidationError

background_bp = Blueprint(
    "background",
    __name__,
    url_prefix="/api/background",
)


def _error_response(code: str, message: str, status_code: int):
    return jsonify(success=False, error={"code": code, "message": message}), status_code


def _service() -> BackgroundService:
    return BackgroundService(
        current_app.config["IMAGE_SESSION_SERVICE"],
        FileStorageService(),
    )


def _image_id_and_params():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, None, _error_response("INVALID_REQUEST", "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, None, _error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if current_app.config["IMAGE_SESSION_SERVICE"].get_session(image_id) is None:
        return None, None, _error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    try:
        params = BackgroundService.validate_params(payload)
    except BackgroundParamError as exc:
        return None, None, _error_response("INVALID_MASK_PARAMS", str(exc), 400)
    return image_id, params, None


@background_bp.post("/mask-preview")
def mask_preview():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    try:
        png_bytes = _service().preview_mask(image_id, params)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response("MASK_PREVIEW_FAILED", "The mask could not be generated.", 400)
    return send_file(io.BytesIO(png_bytes), mimetype="image/png")


@background_bp.post("/remove")
def remove_background():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    try:
        result = _service().remove_background(image_id, params)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response("REMOVE_FAILED", "The background could not be removed.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@background_bp.post("/replace")
def replace_background():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    try:
        background = _service().validate_replace_target(payload)
    except BackgroundParamError as exc:
        return _error_response("INVALID_BACKGROUND_TARGET", str(exc), 400)
    except FileValidationError as exc:
        return _error_response("BACKGROUND_NOT_FOUND", str(exc), 404)
    try:
        result = _service().replace_background(image_id, params, background)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response("REPLACE_FAILED", "The background could not be replaced.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@background_bp.get("/backgrounds")
def list_backgrounds():
    return jsonify(success=True, backgrounds=_service().list_backgrounds())


@background_bp.post("/backgrounds")
def upload_background():
    uploaded_file = request.files.get("file")
    filename = uploaded_file.filename if uploaded_file else ""
    if not uploaded_file or not filename.strip():
        return _error_response("INVALID_REQUEST", "A background image file is required.", 400)
    try:
        name = _service().save_background(uploaded_file, filename)
    except FileValidationError as exc:
        return _error_response("INVALID_FILE", str(exc), 400)
    return jsonify(success=True, background=name)
