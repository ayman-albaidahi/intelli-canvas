import io

from flask import Blueprint, jsonify, request, send_file

from ..auth import require_current_user
from ..authorization import require_owned_image
from ..dependencies import get_session_service, get_storage_service
from ..error_codes import ErrorCodes
from ..errors import error_response
from ..services.background_service import BackgroundParamError, BackgroundService
from ..services.file_service import FileValidationError
from ..views import public_image

background_bp = Blueprint(
    "background",
    __name__,
    url_prefix="/api/background",
)


def _service() -> BackgroundService:
    return BackgroundService(
        get_session_service(),
        get_storage_service(),
    )


def _image_id_and_params():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return (
            None,
            None,
            error_response(
                ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
            ),
        )
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return (
            None,
            None,
            error_response(
                ErrorCodes.INVALID_IMAGE_ID, "A valid image_id is required.", 400
            ),
        )
    if get_session_service().get_session(image_id) is None:
        return (
            None,
            None,
            error_response(
                ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
            ),
        )
    try:
        params = BackgroundService.validate_params(payload)
    except BackgroundParamError as exc:
        return None, None, error_response(ErrorCodes.INVALID_MASK_PARAMS, str(exc), 400)
    return image_id, params, None


@background_bp.post("/mask-preview")
@require_owned_image
def mask_preview():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    try:
        png_bytes = _service().preview_mask(image_id, params)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.MASK_PREVIEW_FAILED, "The mask could not be generated.", 400
        )
    return send_file(io.BytesIO(png_bytes), mimetype="image/png")


@background_bp.post("/remove")
@require_owned_image
def remove_background():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    try:
        result = _service().remove_background(image_id, params)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.REMOVE_FAILED, "The background could not be removed.", 400
        )
    return jsonify(success=True, image=public_image(result))


@background_bp.post("/replace")
@require_owned_image
def replace_background():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    try:
        background = _service().validate_replace_target(payload)
    except BackgroundParamError as exc:
        return error_response(ErrorCodes.INVALID_BACKGROUND_TARGET, str(exc), 400)
    except FileValidationError as exc:
        return error_response(ErrorCodes.BACKGROUND_NOT_FOUND, str(exc), 404)
    try:
        result = _service().replace_background(image_id, params, background)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.REPLACE_FAILED, "The background could not be replaced.", 400
        )
    return jsonify(success=True, image=public_image(result))


@background_bp.post("/replace-preview")
@require_owned_image
def replace_background_preview():
    image_id, params, error = _image_id_and_params()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    try:
        background = _service().validate_replace_target(payload)
        png_bytes = _service().preview_replace(image_id, params, background)
    except BackgroundParamError as exc:
        return error_response(ErrorCodes.INVALID_BACKGROUND_TARGET, str(exc), 400)
    except FileValidationError as exc:
        return error_response(ErrorCodes.BACKGROUND_NOT_FOUND, str(exc), 404)
    except FileNotFoundError as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.REPLACE_PREVIEW_FAILED,
            "The background preview could not be generated.",
            400,
        )
    return send_file(io.BytesIO(png_bytes), mimetype="image/png")


@background_bp.get("/backgrounds")
def list_backgrounds():
    return jsonify(success=True, backgrounds=_service().list_backgrounds())


@background_bp.get("/backgrounds/catalog")
def background_catalog():
    return jsonify(success=True, backgrounds=_service().list_background_catalog())


@background_bp.get("/backgrounds/<name>/thumbnail")
def background_thumbnail(name):
    try:
        path = _service().thumbnail_path(name)
    except FileValidationError as exc:
        return error_response(ErrorCodes.BACKGROUND_NOT_FOUND, str(exc), 404)
    return send_file(path, mimetype="image/jpeg", max_age=3600)


@background_bp.post("/backgrounds")
@require_current_user
def upload_background():
    uploaded_file = request.files.get("file")
    filename = uploaded_file.filename if uploaded_file else ""
    if not uploaded_file or not filename.strip():
        return error_response(
            ErrorCodes.INVALID_REQUEST, "A background image file is required.", 400
        )
    category = request.form.get("category", "general")
    try:
        name = _service().save_background(uploaded_file, filename, category=category)
    except BackgroundParamError as exc:
        return error_response(ErrorCodes.INVALID_BACKGROUND_CATEGORY, str(exc), 400)
    except FileValidationError as exc:
        return error_response(ErrorCodes.INVALID_FILE, str(exc), 400)
    return jsonify(success=True, background=name)
