import sys

from flask import Blueprint, jsonify, request, send_file

from ..dependencies import (
    get_layer_compositor,
    get_session_repository,
    get_session_service,
    get_storage_service,
)
from ..error_codes import ErrorCodes
from ..errors import error_response

# Imported for the test monkeypatch seam: tests swap this module-level name to
# inject an isolated storage root, and get_storage_service detects the change.
from ..services.file_service import (  # noqa: F401
    FileStorageService,
    FileValidationError,
)
from ..services.image_io_service import ImageIOService
from ..services.image_upload_service import ImageUploadService
from ..validation import require_int
from ..views import public_image

images_bp = Blueprint(
    "images",
    __name__,
    url_prefix="/api/images",
)


@images_bp.post("")
def upload_image():
    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return error_response(ErrorCodes.INVALID_REQUEST, "No file was uploaded.", 400)

    filename = uploaded_file.filename or ""
    if not filename or not filename.strip():
        return error_response(ErrorCodes.INVALID_REQUEST, "Filename is required.", 400)

    if filename in {".", ".."} or "/" in filename or "\\" in filename:
        return error_response(
            ErrorCodes.INVALID_FILE, "Unsafe file path is not allowed.", 400
        )

    try:
        public_image = ImageUploadService(
            get_session_service(), get_storage_service(sys.modules[__name__])
        ).upload(uploaded_file, filename)
        return jsonify(success=True, image=public_image)
    except FileValidationError as exc:
        return error_response(ErrorCodes.INVALID_FILE, str(exc), 400)
    except (OSError, TypeError, ValueError, KeyError):
        return error_response(
            ErrorCodes.UPLOAD_FAILED, "The image could not be uploaded.", 500
        )


@images_bp.post("/convert")
def convert_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(
            ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    target_format = payload.get("format")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response(
            ErrorCodes.INVALID_IMAGE_ID, "A valid image_id is required.", 400
        )
    if not isinstance(target_format, str) or not target_format.strip():
        return error_response(
            ErrorCodes.INVALID_FORMAT, "A target format is required.", 400
        )
    if image_id not in get_session_repository():
        return error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )

    try:
        result = ImageIOService(
            get_session_service(), get_storage_service(sys.modules[__name__])
        ).convert(image_id, target_format)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.CONVERSION_FAILED, "The image could not be converted.", 400
        )

    return jsonify(
        success=True,
        image=public_image(result),
    )


@images_bp.get("/<image_id>/content")
def image_content(image_id: str):
    session = get_session_service().get_session(image_id)
    if session is None:
        return error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )

    filename = session.get("current_filename") or session.get("stored_filename")
    if not isinstance(filename, str) or not filename:
        return error_response(
            ErrorCodes.IMAGE_NOT_AVAILABLE, "Image is not available.", 404
        )

    storage_service = get_storage_service(sys.modules[__name__])
    directory = (
        storage_service.processed_dir
        if session.get("current_storage") == "processed"
        else storage_service.uploads_dir
    ).resolve()
    image_path = (directory / filename).resolve()
    try:
        image_path.relative_to(directory)
    except ValueError:
        return error_response(
            ErrorCodes.IMAGE_NOT_AVAILABLE, "Image is not available.", 404
        )
    if not image_path.is_file():
        return error_response(
            ErrorCodes.IMAGE_NOT_AVAILABLE, "Image is not available.", 404
        )

    return send_file(image_path, mimetype=session.get("mime_type"))


@images_bp.post("/export")
def export_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(
            ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    target_format = payload.get("format")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response(
            ErrorCodes.INVALID_IMAGE_ID, "A valid image_id is required.", 400
        )
    if not isinstance(target_format, str) or not target_format.strip():
        return error_response(
            ErrorCodes.INVALID_FORMAT, "A target format is required.", 400
        )
    if image_id not in get_session_repository():
        return error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )

    quality = payload.get("quality")
    if quality is not None:
        require_int(quality, low=1, high=100, name="Quality", code="INVALID_QUALITY")
    width = payload.get("width")
    height = payload.get("height")
    for dimension, value in (("width", width), ("height", height)):
        if value is not None:
            require_int(
                value,
                low=1,
                high=8000,
                name=dimension.capitalize(),
                code="INVALID_DIMENSIONS",
            )
    if width and height and width * height > 24_000_000:
        return error_response(
            ErrorCodes.INVALID_DIMENSIONS,
            "The export area is too large (max 24 megapixels).",
            400,
        )

    try:
        composite_path = None
        if payload.get("composite_layers"):
            composite_path = (
                get_layer_compositor().compose(image_id, persist=False).path
            )
        result = ImageIOService(
            get_session_service(), get_storage_service(sys.modules[__name__])
        ).convert(
            image_id,
            target_format,
            quality=quality,
            width=width,
            height=height,
            source_path=composite_path,
        )
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.EXPORT_FAILED, "The image could not be exported.", 400
        )

    return send_file(
        result.path,
        mimetype=result.mime_type,
        as_attachment=True,
        download_name=result.path.name,
    )
